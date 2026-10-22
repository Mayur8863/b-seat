import type { NestExpressApplication } from '@nestjs/platform-express';

import type { Database } from '../src/db/db.js';
import { DB } from '../src/db/db.module.js';
import { booking, seat, space } from '../src/db/schema/index.js';

/** Direct-insert fixtures for integration tests (the seed is not used; resetDb truncates). */

export type SpaceRow = typeof space.$inferSelect;
export type SeatRow = typeof seat.$inferSelect;
export type BookingRow = typeof booking.$inferSelect;

export function testDb(app: NestExpressApplication): Database {
  return app.get<Database>(DB);
}

let spaceCounter = 0;

export async function createSpace(
  db: Database,
  values: Partial<typeof space.$inferInsert> = {},
): Promise<SpaceRow> {
  spaceCounter += 1;
  const [row] = await db
    .insert(space)
    .values({
      name: `Test Space ${spaceCounter}`,
      location: 'Test City',
      timeZone: 'Europe/London',
      ...values,
    })
    .returning();
  if (!row) throw new Error('createSpace: insert returned no row');
  return row;
}

/** Creates `count` seats labelled `S-01`, `S-02`, … in the space. */
export async function createSeats(
  db: Database,
  spaceId: string,
  count: number,
): Promise<SeatRow[]> {
  const values = Array.from({ length: count }, (_, i) => ({
    spaceId,
    label: `S-${String(i + 1).padStart(2, '0')}`,
  }));
  return db.insert(seat).values(values).returning();
}

/**
 * Inserts a booking row as is, bypassing the API rules (e.g. one that already started).
 * A cancelled booking gets `cancelledAt` unless one is given.
 */
export async function insertBooking(
  db: Database,
  values: {
    seatId: string;
    userId: string;
    startsAt: Date;
    endsAt: Date;
    status?: 'active' | 'cancelled';
    cancelledAt?: Date | null;
  },
): Promise<BookingRow> {
  const cancelledAt =
    values.cancelledAt !== undefined
      ? values.cancelledAt
      : values.status === 'cancelled'
        ? new Date()
        : null;
  const [row] = await db
    .insert(booking)
    .values({ ...values, cancelledAt })
    .returning();
  if (!row) throw new Error('insertBooking: insert returned no row');
  return row;
}
