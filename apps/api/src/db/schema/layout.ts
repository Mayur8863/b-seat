import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { cubicle, seat, space } from './space.js';

export const layoutElementKind = pgEnum('layout_element_kind', ['seat', 'cubicle', 'area']);

/** The floor plan grid of a space; `version` is the optimistic-concurrency token (R-12). */
export const spaceLayout = pgTable(
  'space_layout',
  {
    spaceId: uuid()
      .primaryKey()
      .references(() => space.id, { onDelete: 'restrict' }),
    columns: smallint().notNull(),
    rows: smallint().notNull(),
    version: integer().notNull().default(0),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('space_layout_columns_range', sql`${t.columns} between 10 and 80`),
    check('space_layout_rows_range', sql`${t.rows} between 10 and 80`),
  ],
);

/** A seat, cubicle or free-text area placed on the grid. */
export const layoutElement = pgTable(
  'layout_element',
  {
    id: uuid().primaryKey().defaultRandom(),
    spaceId: uuid()
      .notNull()
      .references(() => spaceLayout.spaceId, { onDelete: 'cascade' }),
    kind: layoutElementKind().notNull(),
    seatId: uuid(),
    cubicleId: uuid(),
    label: text(),
    x: smallint().notNull(),
    y: smallint().notNull(),
    w: smallint().notNull(),
    h: smallint().notNull(),
  },
  (t) => [
    unique('layout_element_seat_id_unique').on(t.seatId),
    unique('layout_element_cubicle_id_unique').on(t.cubicleId),
    foreignKey({
      name: 'layout_element_seat_space_fk',
      columns: [t.seatId, t.spaceId],
      foreignColumns: [seat.id, seat.spaceId],
    }),
    foreignKey({
      name: 'layout_element_cubicle_space_fk',
      columns: [t.cubicleId, t.spaceId],
      foreignColumns: [cubicle.id, cubicle.spaceId],
    }).onDelete('cascade'),
    check(
      'layout_element_kind_ref',
      sql`(${t.kind} = 'seat') = (${t.seatId} IS NOT NULL) AND (${t.kind} = 'cubicle') = (${t.cubicleId} IS NOT NULL) AND (${t.kind} = 'area') = (${t.label} IS NOT NULL)`,
    ),
    check(
      'layout_element_label_length',
      sql`${t.label} IS NULL OR length(btrim(${t.label})) between 1 and 40`,
    ),
    check('layout_element_origin', sql`${t.x} >= 0 AND ${t.y} >= 0`),
    check('layout_element_size', sql`${t.w} >= 1 AND ${t.h} >= 1`),
  ],
);
