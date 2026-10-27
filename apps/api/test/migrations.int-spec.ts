import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SpacesService } from '../src/spaces/spaces.service.js';
import { space } from '../src/db/schema/index.js';
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

  it('still serves the 001 space list and availability reads', async () => {
    const service = new SpacesService(scratch.db);
    const list = await service.list();
    expect(list.items).toEqual([
      expect.objectContaining({
        id: spaceId,
        name: 'Legacy Hub',
        location: 'London',
        seatCount: 1,
      }),
    ]);

    const availability = await service.availability(spaceId, {
      date: '2030-01-07',
      startTime: '09:30',
      endTime: '10:30',
    });
    expect(availability.seats).toEqual([
      expect.objectContaining({ label: 'A-1', status: 'taken' }),
    ]);
  });
});
