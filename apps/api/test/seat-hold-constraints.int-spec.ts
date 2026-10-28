import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../src/db/db.js';
import { booking, seatHold } from '../src/db/schema/index.js';
import {
  createSeats,
  createSpace,
  insertHold,
  insertOccupancyMark,
  insertPassBooking,
  type SeatRow,
  signedInUser,
  testDb,
} from './fixtures.js';
import { createTestApp, pgFailure, resetDb } from './helpers.js';

// The seat_hold, occupancy_mark and booking invariants of ADR-0009, tested against the migrated
// database with direct inserts (no API code, no seat locks).

const at = (day: string, time: string) => new Date(`${day}T${time}:00Z`);
const MONDAY = '2030-01-14';
const TUESDAY = '2030-01-15';
const WEDNESDAY = '2030-01-16';

describe('seat hold constraints (database)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let s1: SeatRow;
  let s2: SeatRow;
  let u: string;
  let v: string;

  beforeAll(async () => {
    app = await createTestApp();
    db = testDb(app);
  });
  beforeEach(async () => {
    await resetDb(app);
    const space = await createSpace(db);
    [s1, s2] = (await createSeats(db, space.id, 2)) as [SeatRow, SeatRow];
    u = (await signedInUser(app, 'u@example.com')).userId;
    v = (await signedInUser(app, 'v@example.com')).userId;
  });
  afterAll(() => app.close());

  /** A pass header plus its one hold, as the booking service will write them. */
  async function bookedHold(seatId: string, userId: string, startsAt: Date, endsAt: Date) {
    const header = await insertPassBooking(db, { seatId, userId, startsAt, endsAt });
    return insertHold(db, { seatId, userId, bookingId: header.id, startsAt, endsAt });
  }

  async function occupancyHold(seatId: string, startsAt: Date, endsAt: Date | null) {
    const mark = await insertOccupancyMark(db, {
      seatId,
      createdBy: u,
      startDate: startsAt.toISOString().slice(0, 10),
    });
    return insertHold(db, { seatId, occupancyMarkId: mark.id, startsAt, endsAt });
  }

  describe('exclusion constraints', () => {
    it('refuses an overlapping day and night hold on one seat (seat_hold_seat_no_overlap)', async () => {
      await bookedHold(s1.id, u, at(MONDAY, '07:00'), at(MONDAY, '19:00'));

      const failure = await pgFailure(
        bookedHold(s1.id, v, at(MONDAY, '18:00'), at(TUESDAY, '07:00')),
      );

      expect(failure).toEqual({ code: '23P01', constraint: 'seat_hold_seat_no_overlap' });
    });

    it('allows touching day and night holds of two renters', async () => {
      await bookedHold(s1.id, u, at(MONDAY, '07:00'), at(MONDAY, '19:00'));
      await bookedHold(s1.id, v, at(MONDAY, '19:00'), at(TUESDAY, '07:00'));

      expect(await db.$count(seatHold)).toBe(2);
    });

    it('blocks later bookings behind an open-ended occupancy hold', async () => {
      await occupancyHold(s1.id, at(MONDAY, '00:00'), null);

      const failure = await pgFailure(
        bookedHold(s1.id, v, at('2030-03-04', '07:00'), at('2030-03-04', '19:00')),
      );

      expect(failure).toEqual({ code: '23P01', constraint: 'seat_hold_seat_no_overlap' });
    });

    it('refuses one renter holding two seats at the same time (seat_hold_user_no_overlap)', async () => {
      await bookedHold(s1.id, u, at(MONDAY, '07:00'), at(MONDAY, '19:00'));

      const failure = await pgFailure(
        bookedHold(s2.id, u, at(MONDAY, '18:00'), at(TUESDAY, '07:00')),
      );

      expect(failure).toEqual({ code: '23P01', constraint: 'seat_hold_user_no_overlap' });
    });

    it('lets occupancy holds on different seats coincide (no user)', async () => {
      await occupancyHold(s1.id, at(MONDAY, '00:00'), null);
      await occupancyHold(s2.id, at(MONDAY, '00:00'), null);

      expect(await db.$count(seatHold)).toBe(2);
    });

    it('ignores an inactive hold when an overlapping active hold is inserted', async () => {
      const cancelled = await insertPassBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at(MONDAY, '07:00'),
        endsAt: at(MONDAY, '19:00'),
        status: 'cancelled',
      });
      await insertHold(db, {
        seatId: s1.id,
        userId: u,
        bookingId: cancelled.id,
        startsAt: at(MONDAY, '07:00'),
        endsAt: at(MONDAY, '19:00'),
        active: false,
      });

      await bookedHold(s1.id, u, at(MONDAY, '08:00'), at(MONDAY, '10:00'));

      expect(await db.$count(seatHold, eq(seatHold.active, true))).toBe(1);
    });

    it('exists as partial exclusion constraints on seat_hold only', async () => {
      const { rows } = await db.execute<{ conrelid: string; conname: string; def: string }>(sql`
        select conrelid::regclass::text as conrelid, conname, pg_get_constraintdef(oid) as def
        from pg_constraint where contype = 'x' order by conname`);

      expect(rows.map((r) => [r.conrelid, r.conname])).toEqual([
        ['seat_hold', 'seat_hold_seat_no_overlap'],
        ['seat_hold', 'seat_hold_user_no_overlap'],
      ]);
      expect(rows[0]?.def).toContain('WHERE (active)');
      expect(rows[1]?.def).toContain('WHERE ((active AND (user_id IS NOT NULL)))');
    });

    it('keeps booking_no_new_hourly NOT VALID', async () => {
      const { rows } = await db.execute<{ convalidated: boolean }>(sql`
        select convalidated from pg_constraint where conname = 'booking_no_new_hourly'`);

      expect(rows).toEqual([{ convalidated: false }]);
    });

    it('lets exactly one of 20 racing 7-occurrence sets commit (SC-005), 5 times', async () => {
      const racers = await Promise.all(
        Array.from({ length: 20 }, (_, i) => signedInUser(app, `racer${i}@example.com`)),
      );
      const days = Array.from({ length: 7 }, (_, i) => `2030-02-${String(4 + i).padStart(2, '0')}`);

      for (let round = 0; round < 5; round += 1) {
        const results = await Promise.allSettled(
          racers.map(({ userId }) =>
            db.transaction(async (tx) => {
              // The app pool's 10 s statement_timeout fires (57014) when the suite loads the CPU
              // and 20 transactions queue behind each other's uncommitted rows; this test is
              // about which constraint wins, not about timing.
              await tx.execute(sql`SET LOCAL statement_timeout = '60s'`);
              const [header] = await tx
                .insert(booking)
                .values({
                  seatId: s1.id,
                  userId,
                  spaceId: s1.spaceId,
                  kind: 'pass',
                  pass: 'week',
                  slot: 'day',
                  startDate: days[0],
                  endDate: days[6],
                  price: '70.00',
                  currency: 'GBP',
                  startsAt: at(days[0] ?? '', '07:00'),
                  endsAt: at(days[6] ?? '', '19:00'),
                })
                .returning({ id: booking.id });
              await tx.insert(seatHold).values(
                days.map((day) => ({
                  seatId: s1.id,
                  userId,
                  bookingId: header?.id,
                  serviceDate: day,
                  startsAt: at(day, '07:00'),
                  endsAt: at(day, '19:00'),
                })),
              );
            }),
          ),
        );

        const failures = results.filter((r) => r.status === 'rejected');
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        for (const f of failures) {
          const reason: unknown = f.reason;
          const failed = Promise.reject(
            reason instanceof Error ? reason : new Error(String(reason)),
          );
          const { code } = await pgFailure(failed);
          expect(['23P01', '40P01']).toContain(code);
        }
        expect(await db.$count(seatHold)).toBe(7);
        await db.delete(booking);
      }
    }, 90_000);
  });

  describe('CHECK constraints', () => {
    it.each([
      {
        name: 'a week pass of 5 days apart',
        values: { pass: 'week' as const, endDate: '2030-01-19' },
      },
      { name: 'a day pass spanning two dates', values: { endDate: '2030-01-15' } },
      { name: 'a month pass of 7 days', values: { pass: 'month' as const, endDate: '2030-01-20' } },
    ])('refuses $name (booking_pass_length)', async ({ values }) => {
      const failure = await pgFailure(
        insertPassBooking(db, {
          seatId: s1.id,
          userId: u,
          startsAt: at(MONDAY, '07:00'),
          endsAt: at(MONDAY, '19:00'),
          startDate: MONDAY,
          ...values,
        }),
      );

      expect(failure).toEqual({ code: '23514', constraint: 'booking_pass_length' });
    });

    it('accepts week and month passes of the right length', async () => {
      await insertPassBooking(db, {
        seatId: s1.id,
        userId: u,
        pass: 'week',
        startDate: MONDAY,
        endDate: '2030-01-20',
        startsAt: at(MONDAY, '07:00'),
        endsAt: at('2030-01-20', '19:00'),
      });
      await insertPassBooking(db, {
        seatId: s2.id,
        userId: u,
        pass: 'month',
        startDate: MONDAY,
        endDate: '2030-02-12',
        startsAt: at(MONDAY, '07:00'),
        endsAt: at('2030-02-12', '19:00'),
      });

      expect(await db.$count(booking)).toBe(2);
    });

    it('refuses a pass without a price (booking_pass_complete)', async () => {
      const failure = await pgFailure(
        insertPassBooking(db, {
          seatId: s1.id,
          userId: u,
          startsAt: at(MONDAY, '07:00'),
          endsAt: at(MONDAY, '19:00'),
          price: null,
        }),
      );

      expect(failure).toEqual({ code: '23514', constraint: 'booking_pass_complete' });
    });

    it.each(['0', '-1.00'])('refuses a price of %s (booking_price_positive)', async (price) => {
      const failure = await pgFailure(
        insertPassBooking(db, {
          seatId: s1.id,
          userId: u,
          startsAt: at(MONDAY, '07:00'),
          endsAt: at(MONDAY, '19:00'),
          price,
        }),
      );

      expect(failure).toEqual({ code: '23514', constraint: 'booking_price_positive' });
    });

    it('refuses a new hourly booking (booking_no_new_hourly)', async () => {
      const failure = await pgFailure(
        db.insert(booking).values({
          seatId: s1.id,
          userId: u,
          kind: 'hourly',
          startsAt: at(MONDAY, '09:00'),
          endsAt: at(MONDAY, '10:00'),
        }),
      );

      expect(failure).toEqual({ code: '23514', constraint: 'booking_no_new_hourly' });
    });

    it('refuses a hold with both a booking and an occupancy mark (seat_hold_one_source)', async () => {
      const header = await insertPassBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at(MONDAY, '07:00'),
        endsAt: at(MONDAY, '19:00'),
      });
      const mark = await insertOccupancyMark(db, {
        seatId: s1.id,
        createdBy: u,
        startDate: MONDAY,
      });

      const failure = await pgFailure(
        insertHold(db, {
          seatId: s1.id,
          userId: u,
          bookingId: header.id,
          occupancyMarkId: mark.id,
          startsAt: at(MONDAY, '07:00'),
          endsAt: at(MONDAY, '19:00'),
        }),
      );

      expect(failure).toEqual({ code: '23514', constraint: 'seat_hold_one_source' });
    });

    it('refuses a hold with no source (seat_hold_one_source)', async () => {
      const failure = await pgFailure(
        insertHold(db, {
          seatId: s1.id,
          startsAt: at(MONDAY, '07:00'),
          endsAt: at(MONDAY, '19:00'),
        }),
      );

      expect(failure).toEqual({ code: '23514', constraint: 'seat_hold_one_source' });
    });

    it('refuses a booking hold without a user (seat_hold_user_iff_booking)', async () => {
      const header = await insertPassBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at(MONDAY, '07:00'),
        endsAt: at(MONDAY, '19:00'),
      });

      const failure = await pgFailure(
        insertHold(db, {
          seatId: s1.id,
          bookingId: header.id,
          startsAt: at(MONDAY, '07:00'),
          endsAt: at(MONDAY, '19:00'),
        }),
      );

      expect(failure).toEqual({ code: '23514', constraint: 'seat_hold_user_iff_booking' });
    });

    it('refuses an unbounded booking hold (seat_hold_booking_bounded)', async () => {
      const header = await insertPassBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at(MONDAY, '07:00'),
        endsAt: at(MONDAY, '19:00'),
      });

      const failure = await pgFailure(
        insertHold(db, {
          seatId: s1.id,
          userId: u,
          bookingId: header.id,
          startsAt: at(MONDAY, '07:00'),
          endsAt: null,
        }),
      );

      expect(failure).toEqual({ code: '23514', constraint: 'seat_hold_booking_bounded' });
    });

    it('refuses a hold that ends before it starts (seat_hold_ends_after_starts)', async () => {
      const mark = await insertOccupancyMark(db, {
        seatId: s1.id,
        createdBy: u,
        startDate: MONDAY,
      });

      const failure = await pgFailure(
        insertHold(db, {
          seatId: s1.id,
          occupancyMarkId: mark.id,
          startsAt: at(MONDAY, '19:00'),
          endsAt: at(MONDAY, '07:00'),
        }),
      );

      expect(failure).toEqual({ code: '23514', constraint: 'seat_hold_ends_after_starts' });
    });

    it('allows a 26-hour booking hold and refuses a longer one (seat_hold_booking_max_length)', async () => {
      await bookedHold(s1.id, u, at(MONDAY, '00:00'), at(TUESDAY, '02:00'));

      const failure = await pgFailure(
        bookedHold(s2.id, v, at(MONDAY, '00:00'), at(TUESDAY, '02:01')),
      );

      expect(failure).toEqual({ code: '23514', constraint: 'seat_hold_booking_max_length' });
    });

    it('refuses an occupancy mark that ends before it starts, or has a long note', async () => {
      expect(
        await pgFailure(
          insertOccupancyMark(db, {
            seatId: s1.id,
            createdBy: u,
            startDate: TUESDAY,
            endDate: MONDAY,
          }),
        ),
      ).toEqual({ code: '23514', constraint: 'occupancy_mark_dates' });
      expect(
        await pgFailure(
          insertOccupancyMark(db, {
            seatId: s1.id,
            createdBy: u,
            startDate: MONDAY,
            note: 'x'.repeat(201),
          }),
        ),
      ).toEqual({ code: '23514', constraint: 'occupancy_mark_note_length' });
      await insertOccupancyMark(db, {
        seatId: s1.id,
        createdBy: u,
        startDate: MONDAY,
        note: 'x'.repeat(200),
      });
    });
  });

  describe('consistency keys (AQ-7)', () => {
    it('refuses a booking hold whose seat or renter differs from its header (seat_hold_booking_fk)', async () => {
      const header = await insertPassBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at(MONDAY, '07:00'),
        endsAt: at(MONDAY, '19:00'),
      });
      const window = { startsAt: at(MONDAY, '07:00'), endsAt: at(MONDAY, '19:00') };

      const otherSeat = await pgFailure(
        insertHold(db, { seatId: s2.id, userId: u, bookingId: header.id, ...window }),
      );
      const otherUser = await pgFailure(
        insertHold(db, { seatId: s1.id, userId: v, bookingId: header.id, ...window }),
      );

      expect(otherSeat).toEqual({ code: '23503', constraint: 'seat_hold_booking_fk' });
      expect(otherUser).toEqual({ code: '23503', constraint: 'seat_hold_booking_fk' });
    });

    it('refuses an inactive hold for an active booking (seat_hold_booking_fk)', async () => {
      const header = await insertPassBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at(MONDAY, '07:00'),
        endsAt: at(MONDAY, '19:00'),
      });

      const failure = await pgFailure(
        insertHold(db, {
          seatId: s1.id,
          userId: u,
          bookingId: header.id,
          startsAt: at(MONDAY, '07:00'),
          endsAt: at(MONDAY, '19:00'),
          active: false,
        }),
      );

      expect(failure).toEqual({ code: '23503', constraint: 'seat_hold_booking_fk' });
    });

    it('refuses an occupancy hold on another seat than its mark (seat_hold_occupancy_mark_fk)', async () => {
      const mark = await insertOccupancyMark(db, {
        seatId: s1.id,
        createdBy: u,
        startDate: MONDAY,
      });

      const failure = await pgFailure(
        insertHold(db, { seatId: s2.id, occupancyMarkId: mark.id, startsAt: at(MONDAY, '00:00') }),
      );

      expect(failure).toEqual({ code: '23503', constraint: 'seat_hold_occupancy_mark_fk' });
    });

    it('refuses a second hold for one mark (seat_hold_occupancy_mark_id_unique)', async () => {
      const mark = await insertOccupancyMark(db, {
        seatId: s1.id,
        createdBy: u,
        startDate: MONDAY,
      });
      await insertHold(db, {
        seatId: s1.id,
        occupancyMarkId: mark.id,
        startsAt: at(MONDAY, '00:00'),
        endsAt: at(TUESDAY, '00:00'),
      });

      const failure = await pgFailure(
        insertHold(db, {
          seatId: s1.id,
          occupancyMarkId: mark.id,
          startsAt: at(WEDNESDAY, '00:00'),
          endsAt: at('2030-01-17', '00:00'),
        }),
      );

      expect(failure).toEqual({ code: '23505', constraint: 'seat_hold_occupancy_mark_id_unique' });
    });

    describe('with an active booking of 7 holds', () => {
      let bookingId: string;
      const days = Array.from({ length: 7 }, (_, i) => `2030-02-${String(4 + i).padStart(2, '0')}`);

      beforeEach(async () => {
        const header = await insertPassBooking(db, {
          seatId: s1.id,
          userId: u,
          pass: 'week',
          startDate: days[0],
          endDate: days[6],
          startsAt: at(days[0] ?? '', '07:00'),
          endsAt: at(days[6] ?? '', '19:00'),
        });
        bookingId = header.id;
        await db.insert(seatHold).values(
          days.map((day) => ({
            seatId: s1.id,
            userId: u,
            bookingId,
            serviceDate: day,
            startsAt: at(day, '07:00'),
            endsAt: at(day, '19:00'),
          })),
        );
      });

      it('cancelling the header alone deactivates every hold and frees the seat', async () => {
        await db
          .update(booking)
          .set({ status: 'cancelled', cancelledAt: new Date() })
          .where(eq(booking.id, bookingId));

        expect(await db.$count(seatHold, eq(seatHold.active, false))).toBe(7);
        await bookedHold(s1.id, v, at(days[2] ?? '', '07:00'), at(days[2] ?? '', '19:00'));
      });

      it('refuses reactivating a hold of a cancelled booking (seat_hold_booking_fk)', async () => {
        await db
          .update(booking)
          .set({ status: 'cancelled', cancelledAt: new Date() })
          .where(eq(booking.id, bookingId));

        const failure = await pgFailure(
          db.update(seatHold).set({ active: true }).where(eq(seatHold.bookingId, bookingId)),
        );

        expect(failure).toEqual({ code: '23503', constraint: 'seat_hold_booking_fk' });
      });

      it('refuses deactivating a hold of an active booking directly (seat_hold_booking_fk)', async () => {
        const failure = await pgFailure(
          db
            .update(seatHold)
            .set({ active: false })
            .where(eq(seatHold.serviceDate, days[0] ?? '')),
        );

        expect(failure).toEqual({ code: '23503', constraint: 'seat_hold_booking_fk' });
      });

      it('deletes the holds with their booking', async () => {
        await db.delete(booking).where(eq(booking.id, bookingId));

        expect(await db.$count(seatHold)).toBe(0);
      });
    });
  });
});
