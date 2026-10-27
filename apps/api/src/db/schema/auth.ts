/**
 * Better Auth core tables (user, session, account, verification).
 * Property names must match Better Auth's field names; DB columns are
 * snake_case via drizzle `casing`. Change only together with the auth config.
 */
import { sql } from 'drizzle-orm';
import { boolean, check, index, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { ACCOUNT_TYPES } from '../../auth/account-type.js';

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const user = pgTable(
  'user',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    // Better Auth additional field (ADR-0010). Not `role`: the admin plugin owns that key.
    // The default makes accounts that predate the marketplace renters (FR-003).
    accountType: text({ enum: ACCOUNT_TYPES }).notNull().default('renter'),
    ...timestamps,
  },
  (t) => [check('user_account_type_valid', sql`${t.accountType} IN ('owner','renter')`)],
);

export const session = pgTable(
  'session',
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    password: text(),
    ...timestamps,
  },
  (t) => [index().on(t.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [index().on(t.identifier)],
);
