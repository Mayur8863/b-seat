import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { seat } from './space.js';

export const bookingStatus = pgEnum('booking_status', ['active', 'cancelled']);

/**
 * One user's reservation of one seat for `[startsAt, endsAt)`.
 *
 * The "no overlap" invariants (per seat and per user, active rows only) are the exclusion
 * constraints `booking_seat_no_overlap` and `booking_user_no_overlap`. drizzle-kit cannot model
 * EXCLUDE, so they live only in drizzle/0002_booking_exclusions.sql (ADR-0008). Changing
 * `status` values or the time columns needs a new custom migration for them.
 */
export const booking = pgTable(
  'booking',
  {
    id: uuid().primaryKey().defaultRandom(),
    seatId: uuid()
      .notNull()
      .references(() => seat.id, { onDelete: 'restrict' }),
    // Better Auth user ids are text; a deleted account takes its bookings with it.
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    status: bookingStatus().notNull().default('active'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    cancelledAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // Not partial: it also serves the ON DELETE CASCADE lookup from `user`.
    index('booking_user_id_starts_at_idx').on(t.userId, t.startsAt),
    check('booking_ends_after_starts', sql`${t.endsAt} > ${t.startsAt}`),
    check(
      'booking_duration_bounds',
      sql`${t.endsAt} - ${t.startsAt} between interval '15 minutes' and interval '10 hours'`,
    ),
    // Exact numeric epoch: a ::bigint cast would round 09:00:00.4 to a valid value.
    check(
      'booking_quarter_hour',
      sql`extract(epoch from ${t.startsAt}) % 900 = 0 and extract(epoch from ${t.endsAt}) % 900 = 0`,
    ),
    check(
      'booking_cancel_consistency',
      sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null)`,
    ),
  ],
);
