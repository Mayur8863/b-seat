import { sql } from 'drizzle-orm';
import { char, check, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth.js';

/** Optional, editable search defaults of a renter (FR-002). One row per user. */
export const renterPreference = pgTable(
  'renter_preference',
  {
    userId: text()
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    country: char({ length: 2 }),
    city: text(),
    area: text(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('renter_preference_country_format', sql`${t.country} ~ '^[A-Z]{2}$'`),
    check('renter_preference_city_length', sql`length(btrim(${t.city})) between 1 and 100`),
    check('renter_preference_area_length', sql`length(btrim(${t.area})) between 1 and 100`),
  ],
);
