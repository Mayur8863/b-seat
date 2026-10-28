import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../src/db/db.js';
import { booking, seat, space, user } from '../src/db/schema/index.js';
import {
  createSeats,
  createSpace,
  insertPassBooking,
  type SeatRow,
  type SpaceRow,
  testDb,
} from './fixtures.js';
import { createTestApp, pgFailure, resetDb, signedInAgent } from './helpers.js';

// The invariants in data-model.md, tested against the migrated database (no API code involved).
// Pass-header and hold constraints are in seat-hold-constraints.int-spec.ts.

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
  let u: string;

  beforeAll(async () => {
    app = await createTestApp();
    db = testDb(app);
  });
  beforeEach(async () => {
    await resetDb(app);
    london = await createSpace(db);
    [s1] = (await createSeats(db, london.id, 2)) as [SeatRow, SeatRow];
    u = await signUpUserId(app, 'u@example.com');
  });
  afterAll(() => app.close());

  describe('the 001 exclusions are gone (ADR-0009 section 6)', () => {
    it('leaves no exclusion constraint on booking', async () => {
      const { rows } = await db.execute<{ conname: string }>(sql`
        select conname from pg_constraint where conrelid = 'booking'::regclass and contype = 'x'`);

      expect(rows).toEqual([]);
    });
  });

  describe('booking CHECK constraints', () => {
    // Postgres checks CHECKs in name order, so booking_ends_after_starts reports before the
    // booking_pass_* checks that an inverted window would also break.
    it('defines booking_ends_after_starts as ends_at > starts_at', async () => {
      const { rows } = await db.execute<{ def: string }>(sql`
        select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'booking'::regclass and conname = 'booking_ends_after_starts'`);

      expect(rows[0]?.def).toBe('CHECK ((ends_at > starts_at))');
    });

    it('refuses an envelope that ends before it starts', async () => {
      const failure = await pgFailure(
        insertPassBooking(db, {
          seatId: s1.id,
          userId: u,
          startsAt: at('12:00'),
          endsAt: at('11:00'),
        }),
      );

      expect(failure).toEqual({ code: '23514', constraint: 'booking_ends_after_starts' });
    });

    it.each([
      { name: 'cancelled without cancelled_at', status: 'cancelled' as const, cancelledAt: null },
      { name: 'active with cancelled_at', status: 'active' as const, cancelledAt: at('08:00') },
    ])('refuses $name (booking_cancel_consistency)', async ({ status, cancelledAt }) => {
      const failure = await pgFailure(
        insertPassBooking(db, {
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

    it('fills defaults and the generated holds_active on a pass header', async () => {
      const row = await insertPassBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at('07:00'),
        endsAt: at('19:00'),
      });

      expect(row).toMatchObject({
        kind: 'pass',
        status: 'active',
        holdsActive: true,
        spaceId: london.id,
        cancelledAt: null,
      });
      expect(row.createdAt).toBeInstanceOf(Date);
    });

    it('refuses a header whose space differs from its seat’s (booking_seat_space_fk)', async () => {
      const other = await createSpace(db);

      const failure = await pgFailure(
        insertPassBooking(db, {
          seatId: s1.id,
          userId: u,
          spaceId: other.id,
          startsAt: at('07:00'),
          endsAt: at('19:00'),
        }),
      );

      expect(failure.code).toBe('23503');
      expect(['booking_seat_id_seat_id_fk', 'booking_seat_space_fk']).toContain(failure.constraint);
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
    // A seat with a pass header is referenced by both booking_seat_id_seat_id_fk (RESTRICT, 23001)
    // and booking_seat_space_fk (NO ACTION, 23503). Which one Postgres reports depends on trigger
    // firing order (by name/OID), so the tests accept either pair instead of relying on it.
    const SEAT_FK_FAILURES = [
      { code: '23001', constraint: 'booking_seat_id_seat_id_fk' },
      { code: '23503', constraint: 'booking_seat_space_fk' },
    ];
    it('refuses deleting a seat that has bookings, and a space that has seats', async () => {
      await insertPassBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at('09:00'),
        endsAt: at('10:00'),
      });

      expect(SEAT_FK_FAILURES).toContainEqual(
        await pgFailure(db.delete(seat).where(eq(seat.id, s1.id))),
      );
      expect(await pgFailure(db.delete(space).where(eq(space.id, london.id)))).toEqual({
        code: '23001',
        constraint: 'seat_space_id_space_id_fk',
      });
    });

    it('deletes a user’s bookings with the user (CASCADE)', async () => {
      await insertPassBooking(db, {
        seatId: s1.id,
        userId: u,
        startsAt: at('09:00'),
        endsAt: at('10:00'),
      });

      await db.delete(user).where(eq(user.id, u));

      expect(await db.$count(booking)).toBe(0);
    });

    it('refuses a booking for an unknown seat (23503 on either seat key)', async () => {
      const failure = await pgFailure(
        insertPassBooking(db, {
          seatId: '00000000-0000-4000-8000-000000000000',
          spaceId: london.id,
          userId: u,
          startsAt: at('09:00'),
          endsAt: at('10:00'),
        }),
      );
      expect(failure.code).toBe('23503');
      expect(['booking_seat_id_seat_id_fk', 'booking_seat_space_fk']).toContain(failure.constraint);
    });
  });
});
