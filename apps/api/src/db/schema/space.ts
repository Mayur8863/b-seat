import { sql } from 'drizzle-orm';
import {
  char,
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth.js';

export const SPACE_STATUSES = ['draft', 'published', 'unpublished'] as const;
export const OPENING_MODES = ['always_open', 'fixed_hours'] as const;
export const spaceStatus = pgEnum('space_status', SPACE_STATUSES);
export const openingMode = pgEnum('opening_mode', OPENING_MODES);

/** An office location people can book in. Its IANA `timeZone` drives every booking rule. */
export const space = pgTable(
  'space',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Not unique: owners name their own spaces (OQ-11).
    name: text().notNull(),
    // Legacy 001 field, superseded by country/city/area/street_address; dropped in a later contract migration.
    location: text(),
    // Validated with isValidTimeZone in TS; PostgreSQL cannot check IANA ids immutably.
    timeZone: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // Null only for legacy rows; the seed claims them (expand/contract, R-7).
    ownerId: text().references(() => user.id, { onDelete: 'restrict' }),
    status: spaceStatus().notNull().default('draft'),
    description: text(),
    country: char({ length: 2 }),
    city: text(),
    area: text(),
    // Normalised search keys; generated so they cannot drift from the display values.
    cityKey: text().generatedAlwaysAs(sql`lower(btrim("city"))`),
    areaKey: text().generatedAlwaysAs(sql`lower(btrim("area"))`),
    streetAddress: text(),
    currency: char({ length: 3 }),
    openingMode: openingMode(),
    opensAt: time(),
    closesAt: time(),
    shiftChangeAt: time(),
    utilities: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    customUtilities: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('space_name_length', sql`length(btrim(${t.name})) between 1 and 100`),
    check('space_location_length', sql`length(${t.location}) <= 200`),
    check('space_description_length', sql`length(btrim(${t.description})) between 1 and 2000`),
    check('space_country_format', sql`${t.country} ~ '^[A-Z]{2}$'`),
    check('space_city_length', sql`length(btrim(${t.city})) between 1 and 100`),
    check('space_area_length', sql`length(btrim(${t.area})) between 1 and 100`),
    check('space_street_address_length', sql`length(btrim(${t.streetAddress})) between 1 and 200`),
    check('space_currency_format', sql`${t.currency} ~ '^[A-Z]{3}$'`),
    // Fixed hours cannot cross midnight (OQ-7); 24-hour spaces need the shift change time.
    check(
      'space_opening_hours_valid',
      sql`${t.openingMode} IS NULL OR (${t.openingMode} = 'always_open' AND ${t.shiftChangeAt} IS NOT NULL) OR (${t.openingMode} = 'fixed_hours' AND ${t.opensAt} IS NOT NULL AND ${t.closesAt} IS NOT NULL AND ${t.closesAt} > ${t.opensAt})`,
    ),
    // Keeps night (T+12h) on the same local day as day, so the slot engine stays simple (R-4).
    check('space_shift_change_before_noon', sql`${t.shiftChangeAt} < '12:00'`),
    check('space_custom_utilities_max', sql`cardinality(${t.customUtilities}) <= 5`),
    // Standard list size (OQ-8). Per-element lengths (1-40) are Zod's; the total bounds row size.
    // 11 = STANDARD_UTILITIES.length (src/reference/utilities.ts); keep in sync.
    check('space_utilities_max', sql`cardinality(${t.utilities}) <= 11`),
    check(
      'space_custom_utilities_length',
      sql`length(array_to_string(${t.customUtilities}, '')) <= 200`,
    ),
    // An owned space is complete, so owner and renter response schemas stay non-nullable.
    check(
      'space_owned_complete',
      sql`${t.ownerId} IS NULL OR (${t.description} IS NOT NULL AND ${t.country} IS NOT NULL AND ${t.city} IS NOT NULL AND ${t.area} IS NOT NULL AND ${t.streetAddress} IS NOT NULL AND ${t.currency} IS NOT NULL AND ${t.openingMode} IS NOT NULL)`,
    ),
    // With space_owned_complete, a published or unpublished space is always complete (FR-008).
    check('space_published_has_owner', sql`${t.status} = 'draft' OR ${t.ownerId} IS NOT NULL`),
    index('space_owner_id_idx').on(t.ownerId),
    index('space_search_idx')
      .on(t.country, t.cityKey, t.areaKey)
      .where(sql`${t.status} = 'published'`),
    index('space_city_prefix_idx')
      .on(t.country, t.cityKey.op('text_pattern_ops'))
      .where(sql`${t.status} = 'published'`),
    index('space_area_prefix_idx')
      .on(t.country, t.cityKey, t.areaKey.op('text_pattern_ops'))
      .where(sql`${t.status} = 'published'`),
    index('space_utilities_gin').using('gin', t.utilities),
  ],
);

/** A named group of seats within a space. Soft-removed so past bookings keep its name. */
export const cubicle = pgTable(
  'cubicle',
  {
    id: uuid().primaryKey().defaultRandom(),
    spaceId: uuid()
      .notNull()
      .references(() => space.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    check('cubicle_name_length', sql`length(btrim(${t.name})) between 1 and 100`),
    uniqueIndex('cubicle_space_id_name_active_unique')
      .on(t.spaceId, t.name)
      .where(sql`${t.removedAt} IS NULL`),
    // Target of the seat's composite FK, so a seat's cubicle is in the seat's space.
    unique('cubicle_id_space_id_unique').on(t.id, t.spaceId),
  ],
);

/** A bookable place within one space; its label is unique among the space's active seats. */
export const seat = pgTable(
  'seat',
  {
    id: uuid().primaryKey().defaultRandom(),
    spaceId: uuid()
      .notNull()
      .references(() => space.id, { onDelete: 'restrict' }),
    label: text().notNull(),
    features: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    cubicleId: uuid(),
    removedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // Also serves "active seats of a space ordered by label"; removed seats free their label (R-15).
    uniqueIndex('seat_space_id_label_active_unique')
      .on(t.spaceId, t.label)
      .where(sql`${t.removedAt} IS NULL`),
    unique('seat_id_space_id_unique').on(t.id, t.spaceId),
    foreignKey({
      name: 'seat_cubicle_space_fk',
      columns: [t.cubicleId, t.spaceId],
      foreignColumns: [cubicle.id, cubicle.spaceId],
    }),
    check('seat_label_length', sql`length(btrim(${t.label})) between 1 and 20`),
    check('seat_features_max', sql`cardinality(${t.features}) <= 10`),
  ],
);
