import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DrizzleQueryError } from 'drizzle-orm';
import type { PinoLogger } from 'nestjs-pino';
import pg from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemException } from '../common/errors/problem.exception.js';
import type { Clock } from '../common/time/clock.js';
import type { Env } from '../config/env.js';
import type { Database } from '../db/db.js';
import type { MailService } from '../mail/mail.service.js';
import {
  BookingsService,
  type Caller,
  CONFIRMATION_ENQUEUE_TIMEOUT_MS,
} from './bookings.service.js';

const NOW = new Date('2026-10-22T12:00:00.000Z');
const SEAT_ID = '0b6c7d1e-0000-4000-8000-000000000001';
const SPACE_ID = '0b6c7d1e-0000-4000-8000-000000000002';
const BOOKING_ID = '0b6c7d1e-0000-4000-8000-000000000003';
const CALLER: Caller = { id: 'user-1', name: 'Ada', email: 'ada@example.com' };
const INPUT = { seatId: SEAT_ID, date: '2026-10-23', startTime: '09:00', endTime: '12:00' };

const SEAT_ROW = {
  seat: { id: SEAT_ID, label: 'A-03' },
  space: {
    id: SPACE_ID,
    name: 'London HQ',
    location: 'London, United Kingdom',
    timeZone: 'Europe/London',
  },
};

const INSERTED = {
  id: BOOKING_ID,
  seatId: SEAT_ID,
  userId: CALLER.id,
  startsAt: new Date('2026-10-23T08:00:00.000Z'),
  endsAt: new Date('2026-10-23T11:00:00.000Z'),
  status: 'active' as const,
  createdAt: new Date('2026-10-22T12:00:00.123Z'),
  cancelledAt: null,
};

function driverError(code: string, constraint?: string): DrizzleQueryError {
  const cause = new pg.DatabaseError('simulated', 0, 'error');
  cause.code = code;
  cause.constraint = constraint;
  return new DrizzleQueryError('insert into "booking" ...', [], cause);
}

type Settle = () => Promise<unknown>;

/** A Drizzle query-builder stand-in: every builder method chains, awaiting it settles. */
function query(settle: Settle): Record<string, unknown> {
  const q: Record<string, unknown> = {
    then: (onOk: (v: unknown) => unknown, onErr: (e: unknown) => unknown) =>
      settle().then(onOk, onErr),
  };
  for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'values', 'returning', 'set']) {
    q[method] = () => q;
  }
  return q;
}

/**
 * `selects` answer db.select() calls in order; `inserts` answer insert attempts. Inserts exist only
 * on the transaction (not on `db`), so one outside it fails; `log` records the order of events.
 */
function fakeDb(selects: unknown[][], inserts: Settle[]) {
  const log: string[] = [];
  const select = vi.fn(() => {
    const rows = selects.shift();
    return query(() => (rows ? Promise.resolve(rows) : Promise.reject(new Error('extra select'))));
  });
  const insert = vi.fn(() => {
    log.push('insert');
    return query(inserts.shift() ?? (() => Promise.reject(new Error('extra insert'))));
  });
  // Each attempt runs two statements before the insert: SET LOCAL lock_timeout, then the seat lock.
  const statements = ['lock_timeout', 'lock'];
  let executed = 0;
  const execute = vi.fn(() => {
    log.push(statements[executed] ?? 'unexpected statement');
    executed += 1;
    return Promise.resolve();
  });
  const tx = { insert, execute };
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
  return { db: { select, transaction } as unknown as Database, select, insert, transaction, log };
}

function fakeLogger() {
  return { setContext: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function fakeMail(send: () => Promise<void> = () => Promise.resolve()) {
  return { send: vi.fn(send) };
}

const clock: Clock = { now: () => NOW };
const config = { get: () => 'http://localhost:3000' } as unknown as ConfigService<Env, true>;

function makeService(
  db: Database,
  {
    logger = fakeLogger(),
    mail = fakeMail(),
  }: { logger?: ReturnType<typeof fakeLogger>; mail?: ReturnType<typeof fakeMail> } = {},
) {
  return new BookingsService(
    db,
    clock,
    mail as unknown as MailService,
    config,
    logger as unknown as PinoLogger,
  );
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  throw new Error('expected a rejection');
}

/** A queue that never answers, as when Redis is down. */
function neverSettles(): void {
  return undefined;
}

describe('BookingsService.create', () => {
  let logger: ReturnType<typeof fakeLogger>;
  beforeEach(() => {
    logger = fakeLogger();
  });

  it('inserts an active booking for the caller and returns local and UTC times (AC 2.1)', async () => {
    const { db, insert, transaction, log } = fakeDb(
      [[SEAT_ROW]],
      [() => Promise.resolve([INSERTED])],
    );

    const booking = await makeService(db, { logger }).create(CALLER, INPUT);

    expect(booking).toEqual({
      id: BOOKING_ID,
      status: 'active',
      date: '2026-10-23',
      startTime: '09:00',
      endTime: '12:00',
      timeZone: 'Europe/London',
      startsAt: '2026-10-23T08:00:00.000Z',
      endsAt: '2026-10-23T11:00:00.000Z',
      seat: { id: SEAT_ID, label: 'A-03' },
      space: { id: SPACE_ID, name: 'London HQ', location: 'London, United Kingdom' },
      createdAt: '2026-10-22T12:00:00.123Z',
      cancelledAt: null,
    });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(log).toEqual(['begin', 'lock_timeout', 'lock', 'insert', 'commit']);
    expect(JSON.stringify(booking)).not.toContain(CALLER.id);
    expect(logger.info).toHaveBeenCalledWith(
      { bookingId: BOOKING_ID, seatId: SEAT_ID },
      'booking.created',
    );
  });

  it('is 404 Seat not found for an unknown seat, without inserting', async () => {
    const { db, insert } = fakeDb([[]], []);

    const err = await rejection(makeService(db).create(CALLER, INPUT));

    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as NotFoundException).message).toBe('Seat not found');
    expect(insert).not.toHaveBeenCalled();
  });

  it('is 422 with the rule type for a rule-breaking window, without inserting (FR-007)', async () => {
    const { db, insert } = fakeDb([[SEAT_ROW]], []);

    const err = await rejection(
      makeService(db).create(CALLER, { ...INPUT, startTime: '06:45', endTime: '08:00' }),
    );

    expect(err).toBeInstanceOf(ProblemException);
    expect(err).toMatchObject({
      type: 'urn:bseat:problem:booking-rule:outside-working-hours',
      title: 'Invalid booking window',
    });
    expect((err as ProblemException).getStatus()).toBe(422);
    expect(insert).not.toHaveBeenCalled();
  });

  it('evaluates the rules with the injected clock (starts-in-past)', async () => {
    const { db } = fakeDb([[SEAT_ROW]], []);

    const err = await rejection(makeService(db).create(CALLER, { ...INPUT, date: '2026-10-22' }));

    expect(err).toMatchObject({ type: 'urn:bseat:problem:booking-rule:starts-in-past' });
  });

  it('maps an exclusion violation to 409 seat-unavailable (AC 2.3)', async () => {
    const { db } = fakeDb(
      [[SEAT_ROW]],
      [() => Promise.reject(driverError('23P01', 'booking_seat_no_overlap'))],
    );

    const err = await rejection(makeService(db).create(CALLER, INPUT));

    expect(err).toMatchObject({ type: 'urn:bseat:problem:booking:seat-unavailable' });
    expect((err as ProblemException).getStatus()).toBe(409);
  });

  it('retries a deadlock and returns the 409 of the second attempt (ADR-0008 section 2)', async () => {
    const { db, transaction } = fakeDb(
      [[SEAT_ROW]],
      [
        () => Promise.reject(driverError('40P01')),
        () => Promise.reject(driverError('23P01', 'booking_seat_no_overlap')),
      ],
    );

    const err = await rejection(makeService(db).create(CALLER, INPUT));

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(err).toMatchObject({ type: 'urn:bseat:problem:booking:seat-unavailable' });
  });

  it('retries a deadlock and succeeds when the other insert was the victim', async () => {
    const { db, transaction } = fakeDb(
      [[SEAT_ROW]],
      [() => Promise.reject(driverError('40P01')), () => Promise.resolve([INSERTED])],
    );

    const booking = await makeService(db).create(CALLER, INPUT);

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(booking.id).toBe(BOOKING_ID);
  });

  it('rethrows after 3 deadlocked attempts (500)', async () => {
    const third = driverError('40P01');
    const { db, transaction } = fakeDb(
      [[SEAT_ROW]],
      [
        () => Promise.reject(driverError('40P01')),
        () => Promise.reject(driverError('40P01')),
        () => Promise.reject(third),
      ],
    );

    const err = await rejection(makeService(db).create(CALLER, INPUT));

    expect(transaction).toHaveBeenCalledTimes(3);
    expect(err).toBe(third);
  });

  it('rethrows an unmapped database error without retrying', async () => {
    const check = driverError('23514', 'booking_quarter_hour');
    const { db, insert } = fakeDb([[SEAT_ROW]], [() => Promise.reject(check)]);

    const err = await rejection(makeService(db).create(CALLER, INPUT));

    expect(insert).toHaveBeenCalledTimes(1);
    expect(err).toBe(check);
  });

  it('logs a lock timeout (ids only) and rethrows it without retrying', async () => {
    const timeout = driverError('55P03');
    const { db, transaction } = fakeDb([[SEAT_ROW]], [() => Promise.reject(timeout)]);

    const err = await rejection(makeService(db, { logger }).create(CALLER, INPUT));

    expect(err).toBe(timeout);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { seatId: SEAT_ID, userId: CALLER.id },
      'booking.lock_timeout',
    );
  });
});

describe('BookingsService.create: confirmation email (FR-008, ADR-0008 section 5)', () => {
  let logger: ReturnType<typeof fakeLogger>;
  beforeEach(() => {
    logger = fakeLogger();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('enqueues the confirmation with job id booking-confirmed-<id> after the insert', async () => {
    const { db, log } = fakeDb([[SEAT_ROW]], [() => Promise.resolve([INSERTED])]);
    const mail = fakeMail(() => {
      // Enqueued only once the transaction has committed.
      expect(log.at(-1)).toBe('commit');
      return Promise.resolve();
    });

    await makeService(db, { logger, mail }).create(CALLER, INPUT);

    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ada@example.com',
        subject: 'Seat A-03 booked at London HQ on 2026-10-23',
        text: expect.stringContaining('09:00–12:00 (Europe/London)'),
      }),
      { jobId: `booking-confirmed-${BOOKING_ID}` },
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('does not enqueue anything when the booking is refused', async () => {
    const { db } = fakeDb(
      [[SEAT_ROW]],
      [() => Promise.reject(driverError('23P01', 'booking_seat_no_overlap'))],
    );
    const mail = fakeMail();

    await rejection(makeService(db, { mail }).create(CALLER, INPUT));

    expect(mail.send).not.toHaveBeenCalled();
  });

  it('still returns the booking and logs an error when enqueueing rejects', async () => {
    const { db } = fakeDb([[SEAT_ROW]], [() => Promise.resolve([INSERTED])]);
    const mail = fakeMail(() => Promise.reject(new Error('Redis down for ada@example.com')));

    const booking = await makeService(db, { logger, mail }).create(CALLER, INPUT);

    expect(booking.id).toBe(BOOKING_ID);
    expectNotQueuedLog(logger);
  });

  it('returns the booking within the 2 s bound when enqueueing never settles', async () => {
    vi.useFakeTimers();
    const { db } = fakeDb([[SEAT_ROW]], [() => Promise.resolve([INSERTED])]);
    const mail = fakeMail(() => new Promise<void>(neverSettles));
    let settled = false;

    const pending = makeService(db, { logger, mail })
      .create(CALLER, INPUT)
      .finally(() => {
        settled = true;
      });
    await vi.advanceTimersByTimeAsync(CONFIRMATION_ENQUEUE_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(settled).toBe(true);
    expect((await pending).id).toBe(BOOKING_ID);
    expect(CONFIRMATION_ENQUEUE_TIMEOUT_MS).toBe(2_000);
    expectNotQueuedLog(logger);
  });
});

/** The failure is logged at error level with the booking id only: no address, no body. */
function expectNotQueuedLog(logger: ReturnType<typeof fakeLogger>) {
  expect(logger.error).toHaveBeenCalledTimes(1);
  const [fields, message] = logger.error.mock.calls[0] ?? [];
  expect(message).toBe('booking.confirmation_not_queued');
  expect(fields).toMatchObject({ bookingId: BOOKING_ID });
  const logged = JSON.stringify(logger.error.mock.calls);
  expect(logged).not.toContain('ada@example.com');
  expect(logged).not.toContain('London HQ');
}
