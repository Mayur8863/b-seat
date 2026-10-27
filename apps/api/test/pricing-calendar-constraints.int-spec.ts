import type { NestExpressApplication } from '@nestjs/platform-express';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../src/db/db.js';
import { availabilityCalendar, passPrice, spaceSlot } from '../src/db/schema/index.js';
import { createListing, createOwner, createSeats, createSpace, testDb } from './fixtures.js';
import { createTestApp, pgFailure, resetDb } from './helpers.js';

// data-model.md "space_slot", "pass_price" and "availability_calendar", against the migrated database.
// The backfill of existing spaces is tested in migrations.int-spec.ts.

const UNKNOWN = '00000000-0000-4000-8000-000000000000';

describe('pricing and calendar constraints (database)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let spaceId: string;

  beforeAll(async () => {
    app = await createTestApp();
    db = testDb(app);
  });
  beforeEach(async () => {
    await resetDb(app);
    spaceId = (await createListing(db, (await createOwner(db)).id)).id;
  });
  afterAll(() => app.close());

  const calendar = (values: Partial<typeof availabilityCalendar.$inferInsert> = {}) =>
    db.insert(availabilityCalendar).values({ spaceId, startDate: '2030-01-01', ...values });

  describe('space_slot', () => {
    it('keys a slot once per space', async () => {
      await db.insert(spaceSlot).values({ spaceId, slot: 'day', enabled: true });
      const failure = await pgFailure(
        db.insert(spaceSlot).values({ spaceId, slot: 'day', enabled: false }),
      );
      expect(failure).toEqual({ code: '23505', constraint: 'space_slot_space_id_slot_pk' });
    });

    it('refuses an unknown space', async () => {
      const failure = await pgFailure(
        db.insert(spaceSlot).values({
          spaceId: UNKNOWN,
          slot: 'day',
          enabled: true,
        }),
      );
      expect(failure).toEqual({ code: '23503', constraint: 'space_slot_space_id_space_id_fk' });
    });
  });

  describe('pass_price', () => {
    const price = (amount: string, pass: 'day' | 'week' | 'month' = 'day') =>
      db.insert(passPrice).values({ spaceId, slot: 'day', pass, amount });

    it('stores a price with two decimals and keys it by slot and pass', async () => {
      await price('499.50');
      await price('2999.00', 'week');
      const rows = await db.select().from(passPrice).orderBy(passPrice.pass);
      expect(rows.map((r) => [r.pass, r.amount])).toEqual([
        ['day', '499.50'],
        ['week', '2999.00'],
      ]);
      const failure = await pgFailure(price('10'));
      expect(failure).toEqual({ code: '23505', constraint: 'pass_price_space_id_slot_pass_pk' });
    });

    it('refuses an unknown space', async () => {
      const failure = await pgFailure(
        db.insert(passPrice).values({ spaceId: UNKNOWN, slot: 'day', pass: 'day', amount: '1' }),
      );
      expect(failure).toEqual({ code: '23503', constraint: 'pass_price_space_id_space_id_fk' });
    });

    it.each(['0', '0.00', '-1', 'NaN'])(
      'refuses amount %s (pass_price_positive)',
      async (amount) => {
        expect(await pgFailure(price(amount))).toEqual({
          code: '23514',
          constraint: 'pass_price_positive',
        });
      },
    );
  });

  describe('availability_calendar', () => {
    it('defaults to every weekday with no end date', async () => {
      const [row] = await calendar().returning();
      expect(row).toMatchObject({ weekdays: 127, endDate: null, seatId: null });
    });

    it('allows one shared calendar per space, and one per other space', async () => {
      await calendar();
      expect(await pgFailure(calendar())).toEqual({
        code: '23505',
        constraint: 'availability_calendar_shared_unique',
      });
      const other = await createSpace(db);
      const [row] = await db
        .insert(availabilityCalendar)
        .values({ spaceId: other.id, startDate: '2030-01-01' })
        .returning();
      expect(row).toMatchObject({ spaceId: other.id, seatId: null });
    });

    it('allows one own calendar per seat', async () => {
      const [seat] = await createSeats(db, spaceId, 1);
      if (!seat) throw new Error('no seat');
      await calendar();
      await calendar({ seatId: seat.id, weekdays: 32 });
      expect(await pgFailure(calendar({ seatId: seat.id }))).toEqual({
        code: '23505',
        constraint: 'availability_calendar_seat_unique',
      });
    });

    it('refuses an unknown space', async () => {
      expect(await pgFailure(calendar({ spaceId: UNKNOWN }))).toEqual({
        code: '23503',
        constraint: 'availability_calendar_space_id_space_id_fk',
      });
    });

    it('refuses an end date before the start date', async () => {
      expect(await pgFailure(calendar({ endDate: '2029-12-31' }))).toEqual({
        code: '23514',
        constraint: 'availability_calendar_range',
      });
      const [row] = await calendar({ endDate: '2030-01-01' }).returning();
      expect(row).toMatchObject({ startDate: '2030-01-01', endDate: '2030-01-01' });
    });

    it.each([0, 128, -1])('refuses weekdays = %i', async (weekdays) => {
      expect(await pgFailure(calendar({ weekdays }))).toEqual({
        code: '23514',
        constraint: 'availability_calendar_weekdays',
      });
    });

    it.each([1, 127])('accepts the weekdays bound %i', async (weekdays) => {
      const [row] = await calendar({ weekdays }).returning();
      expect(row?.weekdays).toBe(weekdays);
    });

    it('refuses a seat calendar whose space is not the seat space', async () => {
      const [seat] = await createSeats(db, spaceId, 1);
      if (!seat) throw new Error('no seat');
      const other = await createSpace(db);
      expect(await pgFailure(calendar({ spaceId: other.id, seatId: seat.id }))).toEqual({
        code: '23503',
        constraint: 'availability_calendar_seat_space_fk',
      });
    });
  });

  describe('space.shift_change_at', () => {
    const shift = (time: string) =>
      db.execute(sql`UPDATE space SET shift_change_at = ${time}::time WHERE id = ${spaceId}`);

    it('allows no shift change at all (fixed-hours spaces)', async () => {
      await expect(
        db.execute(sql`UPDATE space SET shift_change_at = NULL WHERE id = ${spaceId}`),
      ).resolves.toBeDefined();
    });

    it('must be before noon (R-4)', async () => {
      await shift('11:59');
      expect(await pgFailure(shift('12:00'))).toEqual({
        code: '23514',
        constraint: 'space_shift_change_before_noon',
      });
    });
  });
});
