import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { classifyInsertError } from '../src/bookings/booking-conflicts.js';
import {
  lockSeats,
  SEAT_HOLD_LOCK_CLASS,
  type SeatLockTx,
  withSeatLocks,
} from '../src/bookings/seat-lock.js';
import type { Database } from '../src/db/db.js';
import { booking, seatHold } from '../src/db/schema/index.js';
import { createSeats, createSpace, signedInUser, testDb } from './fixtures.js';
import { createTestApp, resetDb } from './helpers.js';

const at = (day: string, time: string) => new Date(`${day}T${time}:00Z`);

describe('seat locks against Postgres (ADR-0009 section 9)', () => {
  let app: NestExpressApplication;
  let db: Database;

  beforeAll(async () => {
    app = await createTestApp();
    db = testDb(app);
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  /** A pass header plus one hold on `seatId` for `userId`, written inside a lock transaction. */
  async function writeHold(tx: SeatLockTx, seatId: string, userId: string, spaceId: string) {
    const startsAt = at('2030-02-04', '07:00');
    const endsAt = at('2030-02-04', '19:00');
    const [header] = await tx
      .insert(booking)
      .values({
        seatId,
        userId,
        spaceId,
        kind: 'pass',
        pass: 'day',
        slot: 'day',
        startDate: '2030-02-04',
        endDate: '2030-02-04',
        price: '10.00',
        currency: 'GBP',
        startsAt,
        endsAt,
      })
      .returning({ id: booking.id });
    await tx.insert(seatHold).values({
      seatId,
      userId,
      bookingId: header?.id,
      serviceDate: '2030-02-04',
      startsAt,
      endsAt,
    });
  }

  describe('lockSeats', () => {
    it('takes one lock of the seat-hold class per distinct seat, however many ids are passed', async () => {
      const space = await createSpace(db);
      const [a, b] = await createSeats(db, space.id, 2);
      if (!a || !b) throw new Error('expected seats');

      const held = await db.transaction(async (tx) => {
        await lockSeats(tx, [a.id, b.id, a.id, b.id, a.id]);
        const { rows } = await tx.execute<{ classid: number; objid: number }>(sql`
          select classid::bigint::int as classid, objid::bigint::int as objid from pg_locks
          where locktype = 'advisory' and pid = pg_backend_pid() and objsubid = 2`);
        const { rows: expected } = await tx.execute<{ k: number }>(
          sql`select hashtext(id::text) as k from unnest(array[${a.id}, ${b.id}]::uuid[]) as t(id)`,
        );
        return { rows, expected: expected.map((r) => r.k) };
      });

      expect(held.rows).toHaveLength(2);
      expect(new Set(held.rows.map((r) => r.classid))).toEqual(new Set([SEAT_HOLD_LOCK_CLASS]));
      expect(held.rows.map((r) => r.objid).sort()).toEqual([...held.expected].sort());
    });

    it('is a no-op for an empty list', async () => {
      await db.transaction(async (tx) => {
        await lockSeats(tx, []);
        const { rows } = await tx.execute(sql`
          select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`);
        expect(rows).toHaveLength(0);
      });
    });

    it('lets two writers lock the same seats in opposite order without a deadlock', async () => {
      const space = await createSpace(db);
      const seats = await createSeats(db, space.id, 6);
      const ids = seats.map((s) => s.id);
      const transaction = vi.spyOn(db, 'transaction');

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, (_, i) =>
          db.transaction(async (tx) => {
            await tx.execute(sql`set local lock_timeout = '5s'`);
            await lockSeats(tx, i % 2 === 0 ? ids : [...ids].reverse());
            await tx.execute(sql`select pg_sleep(0.02)`);
          }),
        ),
      );

      expect(results.filter((r) => r.status === 'rejected')).toEqual([]);
      expect(transaction).toHaveBeenCalledTimes(10);
    });
  });

  describe('withSeatLocks', () => {
    it('lets exactly one of 20 racers for one seat win, and the rest get the 409, never a 5xx', async () => {
      const racers = await Promise.all(
        Array.from({ length: 20 }, (_, i) => signedInUser(app, `racer${i}@example.com`)),
      );
      const space = await createSpace(db);
      const [seat] = await createSeats(db, space.id, 1);
      if (!seat) throw new Error('expected a seat');
      const transaction = vi.spyOn(db, 'transaction');
      const onRetry = vi.fn();

      const results = await Promise.allSettled(
        racers.map(({ userId }) =>
          withSeatLocks(db, [seat.id], (tx) => writeHold(tx, seat.id, userId, space.id), {
            classify: classifyInsertError,
            onRetry,
          }),
        ),
      );

      // One transaction per racer: the lock queues them, so no deadlock retry ran.
      expect(transaction).toHaveBeenCalledTimes(20);
      expect(onRetry).not.toHaveBeenCalled();
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const f of results.filter((r) => r.status === 'rejected')) {
        expect(f.reason).toMatchObject({ type: 'urn:bseat:problem:booking:seat-unavailable' });
      }
      expect(await db.select().from(seatHold).where(eq(seatHold.seatId, seat.id))).toHaveLength(1);
    }, 60_000);

    it('serialises two writers over the same seats passed in opposite order: one wins, one 409, no retry', async () => {
      const [first, second] = await Promise.all([
        signedInUser(app, 'first@example.com'),
        signedInUser(app, 'second@example.com'),
      ]);
      const space = await createSpace(db);
      const [s1, s2] = await createSeats(db, space.id, 2);
      if (!s1 || !s2) throw new Error('expected seats');
      const transaction = vi.spyOn(db, 'transaction');

      const run = (ids: string[], userId: string) =>
        withSeatLocks(
          db,
          ids,
          async (tx) => {
            for (const id of ids) await writeHold(tx, id, userId, space.id);
          },
          { classify: classifyInsertError },
        );
      const results = await Promise.allSettled([
        run([s1.id, s2.id], first.userId),
        run([s2.id, s1.id], second.userId),
      ]);

      expect(transaction).toHaveBeenCalledTimes(2);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failure = results.find((r) => r.status === 'rejected');
      expect(failure?.reason).toMatchObject({
        type: 'urn:bseat:problem:booking:seat-unavailable',
      });
    });
  });
});
