import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../src/db/db.js';
import { booking, seat, space, user } from '../src/db/schema/index.js';
import {
  createSeats,
  createSpace,
  insertBooking,
  type SeatRow,
  type SpaceRow,
  testDb,
} from './fixtures.js';
import { createTestApp, pgFailure, resetDb, signedInAgent } from './helpers.js';

// The invariants in data-model.md, tested against the migrated database (no API code involved).

const DAY = '2030-01-15';
const at = (time: string) => new Date(`${DAY}T${time}Z`);

async function signUpUserId(app: NestExpressApplication, email: string): Promise<string> {
  const agent = await signedInAgent(app, { name: email, email, password: 'correct-horse-battery' });
  const res = await agent.get('/api/me').expect(200);
  const id: unknown = res.body.id;
  if (typeof id !== 'string') throw new Error('sign-up returned no user id');
  return id;
}

describe('booking constraints (database)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let london: SpaceRow;
  let s1: SeatRow;
  let s2: SeatRow;
  let u: string;

  beforeAll(async () => {
    app = await createTestApp();
    db = testDb(app);
  });
  beforeEach(async () => {
    await resetDb(app);
    london = await createSpace(db);
    [s1, s2] = (await createSeats(db, london.id, 2)) as [SeatRow, SeatRow];
    u = await signUpUserId(app, 'u@example.com');
  });
  afterAll(() => app.close());

  describe('exclusion constraints', () => {
    it('refuses an overlapping active booking of the same seat (booking_seat_no_overlap)', async () => {
      const v = await signUpUserId(app, 'v@example.com');
      await insertBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at('09:00'),
        endsAt: at('12:00'),
      });

      const failure = await pgFailure(
        insertBooking(db, { seatId: s1.id, userId: v, startsAt: at('10:00'), endsAt: at('11:00') }),
      );

      expect(failure).toEqual({ code: '23P01', constraint: 'booking_seat_no_overlap' });
      expect(await db.$count(booking)).toBe(1);
    });

    it('refuses an overlapping active booking of the same user on another seat (booking_user_no_overlap)', async () => {
      await insertBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at('09:00'),
        endsAt: at('12:00'),
      });

      const failure = await pgFailure(
        insertBooking(db, { seatId: s2.id, userId: u, startsAt: at('11:00'), endsAt: at('13:00') }),
      );

      expect(failure).toEqual({ code: '23P01', constraint: 'booking_user_no_overlap' });
    });

    it('allows touching windows for the same seat and user (half-open ranges)', async () => {
      await insertBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at('09:00'),
        endsAt: at('12:00'),
      });
      await insertBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at('12:00'),
        endsAt: at('13:00'),
      });

      expect(await db.$count(booking)).toBe(2);
    });

    it('lets an active booking overlap a cancelled one (seat and user)', async () => {
      await insertBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at('09:00'),
        endsAt: at('12:00'),
        status: 'cancelled',
      });
      await insertBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at('10:00'),
        endsAt: at('11:00'),
      });

      expect(await db.$count(booking, eq(booking.status, 'active'))).toBe(1);
    });

    it('allows different seats and different users in the same window', async () => {
      const v = await signUpUserId(app, 'v@example.com');
      await insertBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at('09:00'),
        endsAt: at('12:00'),
      });
      await insertBooking(db, {
        seatId: s2.id,
        userId: v,
        startsAt: at('09:00'),
        endsAt: at('12:00'),
      });

      expect(await db.$count(booking)).toBe(2);
    });

    it('exist in pg_constraint as partial exclusion constraints (custom migration ran)', async () => {
      const { rows } = await db.execute<{ conname: string; contype: string; def: string }>(sql`
        select conname, contype, pg_get_constraintdef(oid) as def
        from pg_constraint
        where conrelid = 'booking'::regclass and contype = 'x'
        order by conname`);

      expect(rows.map((r) => r.conname)).toEqual([
        'booking_seat_no_overlap',
        'booking_user_no_overlap',
      ]);
      for (const row of rows) {
        expect(row.def).toContain("tstzrange(starts_at, ends_at, '[)'::text) WITH &&");
        expect(row.def).toContain("WHERE ((status = 'active'::booking_status))");
      }
    });
  });

  describe('booking CHECK constraints', () => {
    it.each([
      { name: 'end equal to start', start: '12:00', end: '12:00' },
      { name: 'end before start', start: '12:00', end: '11:00' },
      { name: '5 minutes', start: '09:00', end: '09:05', constraint: 'booking_duration_bounds' },
      { name: '10 h 15 min', start: '08:00', end: '18:15', constraint: 'booking_duration_bounds' },
      { name: 'start at :10', start: '09:10', end: '10:10', constraint: 'booking_quarter_hour' },
      {
        name: 'start at 09:00:00.400',
        start: '09:00:00.400',
        end: '10:00:00.400',
        constraint: 'booking_quarter_hour',
      },
    ])('refuses $name with 23514', async ({ start, end, constraint }) => {
      const failure = await pgFailure(
        insertBooking(db, { seatId: s1.id, userId: u, startsAt: at(start), endsAt: at(end) }),
      );

      expect(failure.code).toBe('23514');
      if (constraint) expect(failure.constraint).toBe(constraint);
    });

    // Every inverted window also breaks booking_duration_bounds, which PostgreSQL checks first
    // (CHECKs run in name order), so this one is asserted by definition.
    it('defines booking_ends_after_starts as ends_at > starts_at', async () => {
      const { rows } = await db.execute<{ def: string }>(sql`
        select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'booking'::regclass and conname = 'booking_ends_after_starts'`);

      expect(rows[0]?.def).toBe('CHECK ((ends_at > starts_at))');
    });

    it.each([
      { name: 'cancelled without cancelled_at', status: 'cancelled' as const, cancelledAt: null },
      { name: 'active with cancelled_at', status: 'active' as const, cancelledAt: at('08:00') },
    ])('refuses $name (booking_cancel_consistency)', async ({ status, cancelledAt }) => {
      const failure = await pgFailure(
        insertBooking(db, {
          seatId: s1.id,
          userId: u,
          startsAt: at('09:00'),
          endsAt: at('10:00'),
          status,
          cancelledAt,
        }),
      );

      expect(failure).toEqual({ code: '23514', constraint: 'booking_cancel_consistency' });
    });

    it('accepts the duration bounds exactly (15 min and 10 h) with defaults filled in', async () => {
      const short = await insertBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at('07:00'),
        endsAt: at('07:15'),
      });
      const long = await insertBooking(db, {
        seatId: s2.id,
        userId: await signUpUserId(app, 'v@example.com'),
        startsAt: at('07:00'),
        endsAt: at('17:00'),
      });

      expect(short).toMatchObject({ status: 'active', cancelledAt: null });
      expect(short.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(short.createdAt).toBeInstanceOf(Date);
      expect(long.status).toBe('active');
    });
  });

  describe('space and seat constraints', () => {
    it('refuses a duplicate seat label within one space (23505) but allows it in another space', async () => {
      const failure = await pgFailure(
        db.insert(seat).values({ spaceId: london.id, label: s1.label }),
      );
      expect(failure).toEqual({ code: '23505', constraint: 'seat_space_id_label_active_unique' });

      const other = await createSpace(db);
      await db.insert(seat).values({ spaceId: other.id, label: s1.label });
    });

    it('defaults seat features to an empty array', () => {
      expect(s1.features).toEqual([]);
    });

    it.each([
      { name: 'a blank space name', values: { name: '   ' } },
      { name: 'a space name over 100 characters', values: { name: 'x'.repeat(101) } },
      { name: 'a location over 200 characters', values: { location: 'x'.repeat(201) } },
    ])('refuses $name (23514)', async ({ values }) => {
      const failure = await pgFailure(createSpace(db, values));
      expect(failure.code).toBe('23514');
    });

    it.each([
      { name: 'a blank seat label', label: ' ' },
      { name: 'a seat label over 20 characters', label: 'x'.repeat(21) },
    ])('refuses $name (23514)', async ({ label }) => {
      const failure = await pgFailure(db.insert(seat).values({ spaceId: london.id, label }));
      expect(failure).toEqual({ code: '23514', constraint: 'seat_label_length' });
    });
  });

  describe('foreign keys', () => {
    // ON DELETE RESTRICT reports restrict_violation (23001), not foreign_key_violation (23503).
    it('refuses deleting a seat that has bookings, and a space that has seats (RESTRICT)', async () => {
      await insertBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at('09:00'),
        endsAt: at('10:00'),
      });

      expect(await pgFailure(db.delete(seat).where(eq(seat.id, s1.id)))).toEqual({
        code: '23001',
        constraint: 'booking_seat_id_seat_id_fk',
      });
      expect(await pgFailure(db.delete(space).where(eq(space.id, london.id)))).toEqual({
        code: '23001',
        constraint: 'seat_space_id_space_id_fk',
      });
    });

    it('deletes a user’s bookings with the user (CASCADE)', async () => {
      await insertBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at('09:00'),
        endsAt: at('10:00'),
      });

      await db.delete(user).where(eq(user.id, u));

      expect(await db.$count(booking)).toBe(0);
    });

    it('refuses a booking for an unknown seat (booking_seat_id_seat_id_fk)', async () => {
      const failure = await pgFailure(
        insertBooking(db, {
          seatId: '00000000-0000-4000-8000-000000000000',
          userId: u,
          startsAt: at('09:00'),
          endsAt: at('10:00'),
        }),
      );
      expect(failure).toEqual({ code: '23503', constraint: 'booking_seat_id_seat_id_fk' });
    });
  });
});
