import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { passType, slotKind } from './pricing.js';
import { seat } from './space.js';

export const bookingStatus = pgEnum('booking_status', ['active', 'cancelled']);
// `hourly` rows are 001 history: booking_no_new_hourly refuses new or updated ones (ADR-0009 section 6).
export const bookingKind = pgEnum('booking_kind', ['hourly', 'pass']);

/**
 * The pass header: one renter's pass on one seat (`kind = 'pass'`), with `startsAt`/`endsAt` as the
 * envelope of its holds. `kind = 'hourly'` rows are read-only 001 history.
 *
 * Blocking is done by `seat_hold`, not by this table. The "no overlap" invariants are the
 * exclusion constraints `seat_hold_seat_no_overlap` and `seat_hold_user_no_overlap`. drizzle-kit
 * cannot model EXCLUDE, so they live only in drizzle/*_seat_hold_exclusions.sql (ADR-0009
 * section 2), which also adds `booking_no_new_hourly`. Changing the hold time columns or
 * `active` needs a new custom migration for them.
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
    kind: bookingKind().notNull().default('hourly'),
    spaceId: uuid(),
    pass: passType(),
    slot: slotKind(),
    startDate: date({ mode: 'string' }),
    endDate: date({ mode: 'string' }),
    // Snapshots of the price at booking time (FR-013).
    price: numeric({ precision: 12, scale: 2 }),
    currency: char({ length: 3 }),
    // STORED (PG 18 defaults to VIRTUAL, which cannot back a unique constraint): the target of
    // seat_hold_booking_fk, so cancelling cascades to the holds (ADR-0009 section 3).
    holdsActive: boolean()
      .generatedAlwaysAs(sql`status = 'active'`)
      .notNull(),
  },
  (t) => [
    // Not partial: it also serves the ON DELETE CASCADE lookup from `user`.
    index('booking_user_id_starts_at_idx').on(t.userId, t.startsAt),
    check('booking_ends_after_starts', sql`${t.endsAt} > ${t.startsAt}`),
    check(
      'booking_duration_bounds',
      sql`${t.kind} <> 'hourly' or ${t.endsAt} - ${t.startsAt} between interval '15 minutes' and interval '10 hours'`,
    ),
    // Exact numeric epoch: a ::bigint cast would round 09:00:00.4 to a valid value.
    check(
      'booking_quarter_hour',
      sql`${t.kind} <> 'hourly' or (extract(epoch from ${t.startsAt}) % 900 = 0 and extract(epoch from ${t.endsAt}) % 900 = 0)`,
    ),
    index('booking_space_id_starts_at_idx').on(t.spaceId, t.startsAt),
    unique('booking_hold_key_unique').on(t.id, t.seatId, t.userId, t.holdsActive),
    foreignKey({
      name: 'booking_seat_space_fk',
      columns: [t.seatId, t.spaceId],
      foreignColumns: [seat.id, seat.spaceId],
    }),
    check(
      'booking_pass_complete',
      sql`${t.kind} = 'hourly' or (${t.spaceId} is not null and ${t.pass} is not null and ${t.slot} is not null and ${t.startDate} is not null and ${t.endDate} is not null and ${t.price} is not null and ${t.currency} is not null)`,
    ),
    check(
      'booking_pass_length',
      sql`${t.kind} = 'hourly' or ${t.endDate} - ${t.startDate} = case ${t.pass} when 'day' then 0 when 'week' then 6 else 29 end`,
    ),
    check('booking_price_positive', sql`${t.price} is null or ${t.price} > 0`),
    check(
      'booking_cancel_consistency',
      sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null)`,
    ),
  ],
);

/** A seat held by its owner for a period (FR-022); its one hold is the source of truth for blocking. */
export const occupancyMark = pgTable(
  'occupancy_mark',
  {
    id: uuid().primaryKey().defaultRandom(),
    spaceId: uuid().notNull(),
    seatId: uuid().notNull(),
    startDate: date({ mode: 'string' }).notNull(),
    // Null = until marked vacant.
    endDate: date({ mode: 'string' }),
    note: text(),
    createdBy: text()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Audit only; the hold decides blocking and status.
    endedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: 'occupancy_mark_seat_space_fk',
      columns: [t.seatId, t.spaceId],
      foreignColumns: [seat.id, seat.spaceId],
    }),
    unique('occupancy_mark_id_seat_id_unique').on(t.id, t.seatId),
    check('occupancy_mark_dates', sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
    check('occupancy_mark_note_length', sql`${t.note} is null or length(${t.note}) <= 200`),
  ],
);

/**
 * One held interval of one seat, from a pass booking or an occupancy mark (ADR-0009). The
 * exclusion constraints `seat_hold_seat_no_overlap` and `seat_hold_user_no_overlap` are in the
 * custom migration (drizzle-kit cannot model EXCLUDE).
 */
export const seatHold = pgTable(
  'seat_hold',
  {
    id: uuid().primaryKey().defaultRandom(),
    seatId: uuid()
      .notNull()
      .references(() => seat.id, { onDelete: 'restrict' }),
    userId: text().references(() => user.id, { onDelete: 'cascade' }),
    bookingId: uuid(),
    occupancyMarkId: uuid(),
    serviceDate: date({ mode: 'string' }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    // Null = unbounded (occupancy without an end date only).
    endsAt: timestamp({ withTimezone: true }),
    active: boolean().notNull().default(true),
  },
  (t) => [
    foreignKey({
      name: 'seat_hold_booking_fk',
      columns: [t.bookingId, t.seatId, t.userId, t.active],
      foreignColumns: [booking.id, booking.seatId, booking.userId, booking.holdsActive],
    })
      .onUpdate('cascade')
      .onDelete('cascade'),
    foreignKey({
      name: 'seat_hold_occupancy_mark_fk',
      columns: [t.occupancyMarkId, t.seatId],
      foreignColumns: [occupancyMark.id, occupancyMark.seatId],
    }).onDelete('cascade'),
    unique('seat_hold_occupancy_mark_id_unique').on(t.occupancyMarkId),
    index('seat_hold_seat_id_idx').on(t.seatId),
    index('seat_hold_booking_id_idx').on(t.bookingId),
    index('seat_hold_user_id_idx').on(t.userId),
    check('seat_hold_one_source', sql`num_nonnulls(${t.bookingId}, ${t.occupancyMarkId}) = 1`),
    check('seat_hold_user_iff_booking', sql`(${t.bookingId} is null) = (${t.userId} is null)`),
    check(
      'seat_hold_booking_bounded',
      sql`${t.bookingId} is null or (${t.endsAt} is not null and ${t.serviceDate} is not null)`,
    ),
    check('seat_hold_ends_after_starts', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    check(
      'seat_hold_booking_max_length',
      sql`${t.bookingId} is null or ${t.endsAt} - ${t.startsAt} <= interval '26 hours'`,
    ),
  ],
);
