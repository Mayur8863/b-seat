import { type HttpException } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import type { Database } from '../db/db.js';

/** Cross-seat user-overlap deadlocks are retried (same-seat ones are queued by the seat locks); see ADR-0009 section 9. */
export const MAX_INSERT_ATTEMPTS = 3;

/** Longest a write may wait on a seat lock or a row lock before it fails (ADR-0009 section 9). */
export const LOCK_TIMEOUT = '5s';

/**
 * Advisory lock class 0x42530001, "seat-hold write". The two-int key form never collides with
 * bigint-keyed locks. A new class takes the next value and is added to ADR-0009 section 9.
 */
export const SEAT_HOLD_LOCK_CLASS = 1112735745;

/** Most seats one transaction may lock (ADR-0009 section 9.2). */
export const MAX_LOCKED_SEATS = 200;

export type SeatLockTx = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Takes one transaction-scoped advisory lock per seat, de-duplicated and in ascending **key**
 * order (not seat id order: two seats can share a 32-bit hash, and only key order is free of
 * lock-order cycles), in one statement. This is the only place that calls `pg_advisory_*`.
 * Lock order (ADR-0009 section 9.3): `SET LOCAL lock_timeout`, then exactly one space row (`FOR SHARE`
 * to add or end holds or marks, `FOR UPDATE` to remove seats or change the space), then this call,
 * once, then the seat rows and the inserts. Never lock a seat, booking, hold or mark row before it.
 */
export async function lockSeats(tx: SeatLockTx, seatIds: readonly string[]): Promise<void> {
  const distinct = [...new Set(seatIds)];
  if (distinct.length === 0) return;
  if (distinct.length > MAX_LOCKED_SEATS) {
    throw new RangeError(`Cannot lock more than ${MAX_LOCKED_SEATS} seats in one transaction`);
  }
  await tx.execute(lockSeatsStatement(distinct));
}

/**
 * One bound uuid array; the subquery's ORDER BY is not flattened, so locks are taken in key order.
 * `sql.param` keeps the JS array as one parameter (a bare array would be spread into a list), and
 * node-postgres quotes each element, so an id can never split into extra elements.
 */
export function lockSeatsStatement(distinct: readonly string[]) {
  return sql`
    select pg_advisory_xact_lock(${SEAT_HOLD_LOCK_CLASS}::int, k)
    from (select distinct hashtext(id::text) as k from unnest(${sql.param(distinct)}::uuid[]) as t(id) order by k) as keys`;
}

/** What `classify` decides about a database error from the writer's statements. */
export type ErrorOutcome = HttpException | 'retry' | 'lock-timeout' | 'rethrow';

export interface SeatLockOptions {
  /** Maps a database error to a 409 (returned), a retry, a lock timeout or a rethrow. */
  classify: (err: unknown) => ErrorOutcome;
  /** Called before each deadlock retry (log `warn`, ids only). A throw is swallowed. */
  onRetry?: (attempt: number) => void;
  /**
   * Row locks to take after `lock_timeout` is set and before the seat locks. Use it only to
   * follow a lock order another writer already has (see `BookingsService`); it must not take
   * any lock the other seat writers could hold while they wait for the seat locks.
   */
  beforeLocks?: (tx: SeatLockTx) => Promise<void>;
  /** Called on a lock timeout (log `warn`, ids only). A throw is swallowed. */
  onLockTimeout?: () => void;
}

function swallow(hook: () => void): void {
  try {
    hook();
  } catch {
    // A failing hook must not replace the original error.
  }
}

/**
 * Runs `work` in one short transaction that first sets `lock_timeout`, then `lockSeats`, so
 * concurrent writers for the same seats queue here instead of colliding inside an
 * exclusion-constraint check (where Postgres resolves the collision as a deadlock only after
 * `deadlock_timeout` and 20+ racers exhaust the retries).
 *
 * A deadlock is retried up to `MAX_INSERT_ATTEMPTS` times, one fresh transaction (and fresh
 * locks) each, so `work` must be safe to re-run: it only runs database statements on `tx` (no
 * mail, cache or success logging), it does not catch database errors, and it returns only
 * values derived from `tx`. A lock timeout is not retried: waiting again would pile on.
 */
export async function withSeatLocks<T>(
  db: Database,
  seatIds: readonly string[],
  work: (tx: SeatLockTx) => Promise<T>,
  { classify, onRetry, onLockTimeout, beforeLocks }: SeatLockOptions,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('lock_timeout', ${LOCK_TIMEOUT}, true)`);
        if (beforeLocks) await beforeLocks(tx);
        await lockSeats(tx, seatIds);
        return work(tx);
      });
    } catch (err) {
      const outcome = classify(err);
      if (outcome === 'lock-timeout') {
        if (onLockTimeout) swallow(onLockTimeout);
        throw err;
      }
      if (outcome === 'retry' && attempt < MAX_INSERT_ATTEMPTS) {
        if (onRetry)
          swallow(() => {
            onRetry(attempt);
          });
        continue;
      }
      if (outcome === 'retry' || outcome === 'rethrow') throw err;
      throw outcome;
    }
  }
}
