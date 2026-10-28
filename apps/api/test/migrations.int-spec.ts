import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SpacesService } from '../src/spaces/spaces.service.js';
import { space } from '../src/db/schema/index.js';
import { pgFailure } from './helpers.js';
import { createScratchDatabase, type ScratchDatabase } from './migration-harness.js';

// Expand migrations must keep existing rows valid (research R-7). Rows are inserted with raw SQL
// in the shape the previous migration left, because the current Drizzle schema no longer matches it.

describe('migration 0004_listings on top of 001 data', () => {
  let scratch: ScratchDatabase;
  const spaceId = '11111111-1111-4111-8111-111111111111';
  const seatId = '22222222-2222-4222-8222-222222222222';

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await scratch.migrateTo('0003_user_account_type');
    const { pool } = scratch;
    await pool.query(
      `INSERT INTO "user" (id, name, email) VALUES ('u1', 'Legacy', 'legacy@example.com')`,
    );
    await pool.query(
      `INSERT INTO space (id, name, location, time_zone) VALUES ($1, 'Legacy Hub', 'London', 'Europe/London')`,
      [spaceId],
    );
    await pool.query(`INSERT INTO seat (id, space_id, label) VALUES ($1, $2, 'A-1')`, [
      seatId,
      spaceId,
    ]);
    await pool.query(
      `INSERT INTO booking (seat_id, user_id, starts_at, ends_at)
       VALUES ($1, 'u1', '2030-01-07 09:00+00', '2030-01-07 11:00+00')`,
      [seatId],
    );
    // Guards the harness itself: the 0004 column must not exist yet, or the test proves nothing.
    const before = await pool.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'space' AND column_name = 'status'`,
    );
    expect(before.rowCount).toBe(0);
    await scratch.migrateToLatest();
  }, 60_000);

  afterAll(async () => {
    await scratch.drop();
  });

  it('keeps the legacy space as a draft with no owner and its location', async () => {
    const [row] = await scratch.db.select().from(space).where(eq(space.id, spaceId));
    expect(row).toMatchObject({
      name: 'Legacy Hub',
      location: 'London',
      status: 'draft',
      ownerId: null,
      description: null,
      cityKey: null,
      utilities: [],
      customUtilities: [],
    });
  });

  it('keeps the legacy seat active and the booking intact', async () => {
    const seats = await scratch.pool.query<{ removed_at: Date | null; cubicle_id: string | null }>(
      'SELECT removed_at, cubicle_id FROM seat WHERE id = $1',
      [seatId],
    );
    expect(seats.rows).toEqual([{ removed_at: null, cubicle_id: null }]);
    const bookings = await scratch.pool.query<{ status: string }>(
      'SELECT status FROM booking WHERE seat_id = $1',
      [seatId],
    );
    expect(bookings.rows).toEqual([{ status: 'active' }]);
  });

  it('hides the legacy draft space from the 001 reads until it is published (T008, FR-009)', async () => {
    const service = new SpacesService(scratch.db);
    expect((await service.list()).items).toEqual([]);

    await expect(
      service.availability(spaceId, { date: '2030-01-07', startTime: '09:30', endTime: '10:30' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('migration 0007_shared_calendar_backfill on top of existing spaces', () => {
  let scratch: ScratchDatabase;
  const utcSpace = '33333333-3333-4333-8333-333333333333';
  const aucklandSpace = '44444444-4444-4444-8444-444444444444';
  const laSpace = '55555555-5555-4555-8555-555555555555';

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await scratch.migrateTo('0005_renter_preferences');
    // 03:00 UTC on 8 Jan is 8 Jan in UTC and Auckland (16:00) but still 7 Jan in Los Angeles (19:00).
    const createdAt = '2030-01-08 03:00+00';
    for (const [id, zone] of [
      [utcSpace, 'UTC'],
      [aucklandSpace, 'Pacific/Auckland'],
      [laSpace, 'America/Los_Angeles'],
    ] as const) {
      await scratch.pool.query(
        `INSERT INTO space (id, name, time_zone, created_at) VALUES ($1, 'Old', $2, $3)`,
        [id, zone, createdAt],
      );
    }
    await scratch.migrateToLatest();
  }, 60_000);

  afterAll(async () => {
    await scratch.drop();
  });

  it('gives each space one shared calendar starting on its local creation date', async () => {
    const { rows } = await scratch.pool.query<{
      space_id: string;
      seat_id: string | null;
      start_date: string;
      end_date: string | null;
      weekdays: number;
    }>(
      `SELECT space_id, seat_id, start_date::text, end_date::text, weekdays
       FROM availability_calendar ORDER BY space_id`,
    );
    expect(rows).toEqual([
      {
        space_id: utcSpace,
        seat_id: null,
        start_date: '2030-01-08',
        end_date: null,
        weekdays: 127,
      },
      {
        space_id: aucklandSpace,
        seat_id: null,
        start_date: '2030-01-08',
        end_date: null,
        weekdays: 127,
      },
      { space_id: laSpace, seat_id: null, start_date: '2030-01-07', end_date: null, weekdays: 127 },
    ]);
  });

  it('is safe to run again: the body of the migration adds nothing', async () => {
    const sqlText = readFileSync(
      fileURLToPath(new URL('../drizzle/0007_shared_calendar_backfill.sql', import.meta.url)),
      'utf8',
    );
    await scratch.pool.query(sqlText);
    const { rows } = await scratch.pool.query<{ count: string }>(
      'SELECT count(*) FROM availability_calendar',
    );
    expect(rows).toEqual([{ count: '3' }]);
  });
});

describe('migration 0010_seat_hold_exclusions on top of hourly bookings (OQ-3, ADR-0009 section 6)', () => {
  let scratch: ScratchDatabase;
  const spaceId = '33333333-3333-4333-8333-333333333333';
  const liveSeat = '44444444-4444-4444-8444-444444444441';
  const endedSeat = '44444444-4444-4444-8444-444444444442';
  const live = '55555555-5555-4555-8555-555555555551';
  const ended = '55555555-5555-4555-8555-555555555552';

  beforeAll(async () => {
    scratch = await createScratchDatabase();
    await scratch.migrateTo('0008_pass_price_not_nan');
    const { pool } = scratch;
    await pool.query(`INSERT INTO "user" (id, name, email) VALUES ('u1', 'U', 'u1@example.com')`);
    await pool.query(
      `INSERT INTO space (id, name, location, time_zone) VALUES ($1, 'Hub', 'Pune', 'Asia/Kolkata')`,
      [spaceId],
    );
    await pool.query(
      `INSERT INTO seat (id, space_id, label) VALUES ($1, $3, 'A-1'), ($2, $3, 'A-2')`,
      [liveSeat, endedSeat, spaceId],
    );
    // One active booking that ends tomorrow, one that ended yesterday (quarter-hour aligned).
    await pool.query(
      `INSERT INTO booking (id, seat_id, user_id, starts_at, ends_at) VALUES
         ($1, $3, 'u1', date_trunc('hour', now()) + interval '22 hours', date_trunc('hour', now()) + interval '24 hours'),
         ($2, $4, 'u1', date_trunc('hour', now()) - interval '26 hours', date_trunc('hour', now()) - interval '24 hours')`,
      [live, ended, liveSeat, endedSeat],
    );
    await scratch.migrateToLatest();
  }, 60_000);

  afterAll(async () => {
    await scratch.drop();
  });

  it('backfills exactly one active hold, for the booking that has not ended', async () => {
    const { rows } = await scratch.pool.query(
      `SELECT booking_id, seat_id, user_id, active, starts_at = b.starts_at AS same_start,
              service_date = (b.starts_at AT TIME ZONE 'Asia/Kolkata')::date AS local_date
       FROM seat_hold h JOIN booking b ON b.id = h.booking_id`,
    );

    expect(rows).toEqual([
      {
        booking_id: live,
        seat_id: liveSeat,
        user_id: 'u1',
        active: true,
        same_start: true,
        local_date: true,
      },
    ]);
  });

  it('keeps legacy hourly rows as read-only history: updates fail, deletes succeed', async () => {
    const update = await pgFailure(
      scratch.pool.query(`UPDATE booking SET status = 'active' WHERE id = $1`, [ended]),
    );
    expect(update).toEqual({ code: '23514', constraint: 'booking_no_new_hourly' });

    await scratch.pool.query(`DELETE FROM booking WHERE id = $1`, [ended]);
    const { rows } = await scratch.pool.query('SELECT count(*) FROM booking');
    expect(rows).toEqual([{ count: '1' }]);
  });
});
