import { sql } from 'drizzle-orm';

import type { Database } from '../db/db.js';
import { classifyInsertError } from './booking-conflicts.js';

/** Cross-seat user-overlap deadlocks are retried (same-seat ones are queued by the seat lock); see ADR-0008 section 2. */
export const MAX_INSERT_ATTEMPTS = 3;

/** Longest a write may wait on the seat lock or a row lock before it fails (ADR-0009 section 9). */
export const LOCK_TIMEOUT = '5s';

export type SeatLockTx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * LEGACY, kept only until T005: this is 001's seat lock (`hashtextextended(seatId, 0)`), not the
 * `lockSeats` of ADR-0009 section 9 (advisory class 1112735745, sorted keys, many seats). The
 * two never exclude each other, so never use this next to `lockSeats` and do not build new
 * callers on it. T005 replaces the lock statement with `lockSeats` and generalises this into
 * `withSeatLocks` (see T005 in tasks.md).
 *
 * Runs `work` in one short transaction that first sets `lock_timeout` and takes a
 * transaction-scoped advisory lock on the seat, so concurrent writers for the same seat queue
 * here instead of colliding inside an exclusion-constraint check (where Postgres resolves the
 * collision as a deadlock only after `deadlock_timeout` and 20+ racers exhaust the retries).
 *
 * A deadlock is retried up to `MAX_INSERT_ATTEMPTS` times, one fresh transaction each, so `work`
 * must be safe to re-run: it only runs database statements on `tx` (no mail, cache or success
 * logging), it does not catch database errors, and it returns only values derived from `tx`.
 * A lock timeout is not retried: waiting again would pile on. A database error that maps to a
 * 409 is thrown as that problem (`classifyInsertError`, which knows only the `booking_*`
 * constraints that T005 drops). A throw from `onLockTimeout` is swallowed so it cannot replace
 * the original 55P03 error.
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
        try {
          onLockTimeout?.();
        } catch {
          // A failing hook must not hide the lock timeout.
        }
        throw err;
      }
      if (outcome === 'retry' && attempt < MAX_INSERT_ATTEMPTS) continue;
      if (outcome === 'retry' || outcome === 'rethrow') throw err;
      throw outcome;
    }
  }
}
