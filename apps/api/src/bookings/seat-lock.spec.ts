import { DrizzleQueryError } from 'drizzle-orm';
import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/db.js';
import { MAX_INSERT_ATTEMPTS, withSeatLock } from './seat-lock.js';

const SEAT_ID = '0b6c7d1e-0000-4000-8000-000000000001';

function driverError(code: string, constraint?: string): DrizzleQueryError {
  const cause = new pg.DatabaseError('simulated', 0, 'error');
  cause.code = code;
  cause.constraint = constraint;
  return new DrizzleQueryError('insert into "booking" ...', [], cause);
}

/** A transaction stand-in; `log` records the order of events. */
function fakeDb() {
  const log: string[] = [];
  const statements = ['lock_timeout', 'lock'];
  let executed = 0;
  const tx = {
    execute: vi.fn(() => {
      log.push(statements[executed] ?? 'unexpected statement');
      executed += 1;
      return Promise.resolve();
    }),
  };
  const transaction = vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
    log.push('begin');
    executed = 0;
    try {
      const result = await fn(tx);
      log.push('commit');
      return result;
    } catch (err) {
      log.push('rollback');
      throw err;
    }
  });
  return { db: { transaction } as unknown as Database, transaction, log };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected a rejection');
}

describe('withSeatLock', () => {
  it('sets the lock timeout, takes the seat lock, then runs the work, in one transaction', async () => {
    const { db, transaction, log } = fakeDb();

    const result = await withSeatLock(db, SEAT_ID, () => {
      log.push('work');
      return Promise.resolve('done');
    });

    expect(result).toBe('done');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['begin', 'lock_timeout', 'lock', 'work', 'commit']);
  });

  it('maps an exclusion violation to the 409 problem (ADR-0008 section 2)', async () => {
    const { db } = fakeDb();

    const err = await rejection(
      withSeatLock(db, SEAT_ID, () =>
        Promise.reject(driverError('23P01', 'booking_seat_no_overlap')),
      ),
    );

    expect(err).toMatchObject({ type: 'urn:bseat:problem:booking:seat-unavailable' });
    expect((err as { getStatus: () => number }).getStatus()).toBe(409);
  });

  it('retries a deadlock and returns the 409 of the second attempt', async () => {
    const { db, transaction } = fakeDb();
    const attempts = [
      () => Promise.reject(driverError('40P01')),
      () => Promise.reject(driverError('23P01', 'booking_seat_no_overlap')),
    ];

    const err = await rejection(
      withSeatLock(db, SEAT_ID, () => (attempts.shift() ?? (() => Promise.resolve()))()),
    );

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(err).toMatchObject({ type: 'urn:bseat:problem:booking:seat-unavailable' });
  });

  it('retries a deadlock and succeeds when the other writer was the victim', async () => {
    const { db, transaction } = fakeDb();
    const attempts = [() => Promise.reject(driverError('40P01')), () => Promise.resolve('ok')];

    const result = await withSeatLock(db, SEAT_ID, () => {
      const next = attempts.shift();
      return next ? next() : Promise.reject(new Error('extra attempt'));
    });

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(result).toBe('ok');
  });

  it('rethrows after 3 deadlocked attempts (500)', async () => {
    const { db, transaction } = fakeDb();
    const last = driverError('40P01');
    const attempts = [
      () => Promise.reject(driverError('40P01')),
      () => Promise.reject(driverError('40P01')),
      () => Promise.reject(last),
    ];

    const err = await rejection(
      withSeatLock(db, SEAT_ID, () => (attempts.shift() ?? (() => Promise.resolve()))()),
    );

    expect(MAX_INSERT_ATTEMPTS).toBe(3);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(err).toBe(last);
  });

  it('rethrows an unmapped database error without retrying', async () => {
    const { db, transaction } = fakeDb();
    const check = driverError('23514', 'booking_quarter_hour');

    const err = await rejection(withSeatLock(db, SEAT_ID, () => Promise.reject(check)));

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(err).toBe(check);
  });

  it('reports a lock timeout and rethrows it without retrying', async () => {
    const { db, transaction } = fakeDb();
    const timeout = driverError('55P03');
    const onLockTimeout = vi.fn();

    const err = await rejection(
      withSeatLock(db, SEAT_ID, () => Promise.reject(timeout), onLockTimeout),
    );

    expect(err).toBe(timeout);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(onLockTimeout).toHaveBeenCalledTimes(1);
  });

  it('still throws the lock timeout when the onLockTimeout hook itself throws', async () => {
    const { db, transaction } = fakeDb();
    const timeout = driverError('55P03');
    const onLockTimeout = vi.fn(() => {
      throw new Error('metrics down');
    });

    const err = await rejection(
      withSeatLock(db, SEAT_ID, () => Promise.reject(timeout), onLockTimeout),
    );

    expect(err).toBe(timeout);
    expect(onLockTimeout).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
