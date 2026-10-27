import { sql } from 'drizzle-orm';
import {
  check,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  boolean,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { space } from './space.js';

export const SLOT_KINDS = ['day', 'night', 'full_day', 'working_hours'] as const;
export const PASS_TYPES = ['day', 'week', 'month'] as const;
export const slotKind = pgEnum('slot_kind', SLOT_KINDS);
export const passType = pgEnum('pass_type', PASS_TYPES);

/**
 * Whether a slot kind is switched on for a space. Which kinds are offered depends on
 * `space.opening_mode`; rows of the other mode are kept so switching mode never deletes prices.
 */
export const spaceSlot = pgTable(
  'space_slot',
  {
    spaceId: uuid()
      .notNull()
      .references(() => space.id, { onDelete: 'restrict' }),
    slot: slotKind().notNull(),
    enabled: boolean().notNull(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.slot] })],
);

/** The price of one pass for one slot. No row means the pass is not offered (FR-011). */
export const passPrice = pgTable(
  'pass_price',
  {
    spaceId: uuid()
      .notNull()
      .references(() => space.id, { onDelete: 'restrict' }),
    slot: slotKind().notNull(),
    pass: passType().notNull(),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.spaceId, t.slot, t.pass] }),
    check('pass_price_positive', sql`${t.amount} > 0`),
  ],
);
