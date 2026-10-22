import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/** An office location people can book in. Its IANA `timeZone` drives every booking rule. */
export const space = pgTable(
  'space',
  {
    id: uuid().primaryKey().defaultRandom(),
    // Unique so the seed can upsert by its natural key.
    name: text().notNull().unique('space_name_unique'),
    location: text().notNull(),
    // Validated with isValidTimeZone in TS; PostgreSQL cannot check IANA ids immutably.
    timeZone: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('space_name_length', sql`length(btrim(${t.name})) between 1 and 100`),
    check('space_location_length', sql`length(${t.location}) <= 200`),
  ],
);

/** A bookable place within one space; its label is unique within the space. */
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
  },
  (t) => [
    // Also serves "seats of a space ordered by label".
    unique('seat_space_id_label_unique').on(t.spaceId, t.label),
    check('seat_label_length', sql`length(btrim(${t.label})) between 1 and 20`),
  ],
);
