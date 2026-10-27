import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  pgTable,
  smallint,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { seat, space } from './space.js';

/**
 * When seats can be booked. `seatId` null is the space's shared calendar (one per space, created
 * with it); a seat may have one own calendar that replaces the shared one (FR-024).
 * `weekdays` is a bitmask, Monday = 1 ... Sunday = 64.
 */
export const availabilityCalendar = pgTable(
  'availability_calendar',
  {
    id: uuid().primaryKey().defaultRandom(),
    spaceId: uuid()
      .notNull()
      .references(() => space.id, { onDelete: 'restrict' }),
    seatId: uuid(),
    startDate: date({ mode: 'string' }).notNull(),
    endDate: date({ mode: 'string' }),
    weekdays: smallint().notNull().default(127),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Pins a seat calendar to the seat's own space.
    foreignKey({
      name: 'availability_calendar_seat_space_fk',
      columns: [t.seatId, t.spaceId],
      foreignColumns: [seat.id, seat.spaceId],
    }),
    check(
      'availability_calendar_range',
      sql`${t.endDate} IS NULL OR ${t.endDate} >= ${t.startDate}`,
    ),
    check('availability_calendar_weekdays', sql`${t.weekdays} BETWEEN 1 AND 127`),
    uniqueIndex('availability_calendar_shared_unique')
      .on(t.spaceId)
      .where(sql`${t.seatId} IS NULL`),
    unique('availability_calendar_seat_unique').on(t.seatId),
  ],
);
