import { sql } from 'drizzle-orm';

import type { Database } from '../db/db.js';
import { classifyInsertError } from './booking-conflicts.js';

/** Cross-seat user-overlap deadlocks are retried (same-seat ones are queued by the seat lock); see ADR-0008 section 2. */
export const MAX_INSERT_ATTEMPTS = 3;

/** Longest a write may wait on the seat lock or a row lock before it fails (ADR-0009 section 9). */
export const LOCK_TIMEOUT = '5s';

export type SeatLockTx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Runs `work` in one short transaction that first takes a transaction-scoped advisory lock
 * on the seat, so concurrent writers for the same seat queue here instead of colliding
 * inside an exclusion-constraint check, where Postgres resolves the collision as a deadlock
 * only after `deadlock_timeout` (1 s) and 20+ racers exhaust the retries (HTTP 500). The
 * constraints still decide the outcome; the lock only orders the attempts. Different seats
 * do not contend.
 *
 * Kept from the retired hourly create (T008) for the pass booking and hold writes (T005,
 * T036). A deadlock is retried up to `MAX_INSERT_ATTEMPTS` times, one fresh transaction each,
 * so `work` must be safe to run again. A lock timeout is not retried: the seat is under heavy
 * contention, so waiting again would pile on. A database error that maps to a 409 is thrown
 * as that problem (`classifyInsertError`).
 */
export async function withSeatLock<T>(
  db: Database,
  seatId: string,
  work: (tx: SeatLockTx) => Promise<T>,
  onLockTimeout?: () => void,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`set local lock_timeout = ${sql.raw(`'${LOCK_TIMEOUT}'`)}`);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${seatId}::text, 0))`);
        return work(tx);
      });
    } catch (err) {
      const outcome = classifyInsertError(err);
      if (outcome === 'lock-timeout') {
        onLockTimeout?.();
        throw err;
      }
      if (outcome === 'retry' && attempt < MAX_INSERT_ATTEMPTS) continue;
      if (outcome === 'retry' || outcome === 'rethrow') throw err;
      throw outcome;
    }
  }
}
