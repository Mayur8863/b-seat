import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';

import { toInstant, toLocal } from '../src/common/time/zoned-time.js';
import type { Database } from '../src/db/db.js';
import { DB } from '../src/db/db.module.js';
import {
  booking,
  cubicle,
  occupancyMark,
  seat,
  seatHold,
  space,
  user,
} from '../src/db/schema/index.js';
import { signedInAgent } from './helpers.js';

/** Direct-insert fixtures for integration tests (the seed is not used; resetDb truncates). */

export type SpaceRow = typeof space.$inferSelect;
export type SeatRow = typeof seat.$inferSelect;
export type BookingRow = typeof booking.$inferSelect;
export type HoldRow = typeof seatHold.$inferSelect;
export type OccupancyMarkRow = typeof occupancyMark.$inferSelect;
export type CubicleRow = typeof cubicle.$inferSelect;
export type UserRow = typeof user.$inferSelect;

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

/** Inserts an owner account row directly (no session); use `signedInAgent` when a cookie is needed. */
export async function createOwner(
  db: Database,
  values: Partial<typeof user.$inferInsert> = {},
): Promise<UserRow> {
  const id = randomUUID();
  const [row] = await db
    .insert(user)
    .values({
      id,
      name: 'Owner',
      email: `owner-${id}@example.com`,
      accountType: 'owner',
      ...values,
    })
    .returning();
  if (!row) throw new Error('createOwner: insert returned no row');
  return row;
}

/** A complete owned listing (every `space_owned_complete` field set); draft unless overridden. */
export async function createListing(
  db: Database,
  ownerId: string,
  values: Partial<typeof space.$inferInsert> = {},
): Promise<SpaceRow> {
  return createSpace(db, {
    ownerId,
    description: 'A bright shared office.',
    country: 'IN',
    city: 'Pune',
    area: 'Baner',
    streetAddress: '1 Test Road',
    currency: 'INR',
    openingMode: 'fixed_hours',
    opensAt: '09:00',
    closesAt: '18:00',
    ...values,
  });
}

/**
 * A published listing with its own owner: the only kind the legacy 001 reads (`GET /api/spaces`,
 * availability) show since T008. Use `createSpace` for a draft or ownerless space.
 */
export async function createPublishedSpace(
  db: Database,
  values: Partial<typeof space.$inferInsert> = {},
): Promise<SpaceRow> {
  const owner = await createOwner(db);
  return createListing(db, owner.id, { status: 'published', ...values });
}

export async function createCubicle(
  db: Database,
  spaceId: string,
  values: Partial<typeof cubicle.$inferInsert> = {},
): Promise<CubicleRow> {
  const [row] = await db
    .insert(cubicle)
    .values({ spaceId, name: 'Bay 1', ...values })
    .returning();
  if (!row) throw new Error('createCubicle: insert returned no row');
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

type PassBookingValues = Omit<typeof booking.$inferInsert, 'kind' | 'holdsActive'>;

/**
 * Inserts a pass header as is, bypassing the API rules (hourly rows are refused by
 * `booking_no_new_hourly`). Defaults make a valid one-day pass; `spaceId` defaults to the seat's
 * space, and a cancelled booking gets `cancelledAt` unless one is given. It inserts no holds:
 * use `insertHold`.
 */
export async function insertPassBooking(
  db: Database,
  values: Pick<PassBookingValues, 'seatId' | 'userId' | 'startsAt' | 'endsAt'> &
    Partial<PassBookingValues>,
): Promise<BookingRow> {
  const spaceId =
    values.spaceId ??
    (await db.select({ id: seat.spaceId }).from(seat).where(eq(seat.id, values.seatId)))[0]?.id;
  const startDate = values.startDate ?? values.startsAt.toISOString().slice(0, 10);
  const cancelledAt =
    values.cancelledAt !== undefined
      ? values.cancelledAt
      : values.status === 'cancelled'
        ? new Date()
        : null;
  const [row] = await db
    .insert(booking)
    .values({
      pass: 'day',
      slot: 'day',
      startDate,
      endDate: startDate,
      price: '10.00',
      currency: 'GBP',
      ...values,
      spaceId,
      kind: 'pass',
      cancelledAt,
    })
    .returning();
  if (!row) throw new Error('insertPassBooking: insert returned no row');
  return row;
}

/**
 * Inserts one `seat_hold` as is. It takes no seat lock (the constraint tests need the raw
 * behaviour). `serviceDate` defaults to the start's UTC date when `bookingId` is given.
 */
export async function insertHold(
  db: Database,
  values: Pick<typeof seatHold.$inferInsert, 'seatId' | 'startsAt'> &
    Partial<typeof seatHold.$inferInsert>,
): Promise<HoldRow> {
  const serviceDate =
    values.serviceDate ?? (values.bookingId ? values.startsAt.toISOString().slice(0, 10) : null);
  const [row] = await db
    .insert(seatHold)
    .values({ ...values, serviceDate })
    .returning();
  if (!row) throw new Error('insertHold: insert returned no row');
  return row;
}

/** Inserts an occupancy mark as is (no hold); `spaceId` defaults to the seat's space. */
export async function insertOccupancyMark(
  db: Database,
  values: Pick<typeof occupancyMark.$inferInsert, 'seatId' | 'createdBy' | 'startDate'> &
    Partial<typeof occupancyMark.$inferInsert>,
): Promise<OccupancyMarkRow> {
  const spaceId =
    values.spaceId ??
    (await db.select({ id: seat.spaceId }).from(seat).where(eq(seat.id, values.seatId)))[0]?.id;
  if (!spaceId) throw new Error('insertOccupancyMark: unknown seat');
  const [row] = await db
    .insert(occupancyMark)
    .values({ ...values, spaceId })
    .returning();
  if (!row) throw new Error('insertOccupancyMark: insert returned no row');
  return row;
}

/** The UTC instant of a local wall-clock time; fails the test on a DST gap or overlap. */
export function localInstant(date: string, time: string, timeZone: string): Date {
  const result = toInstant(date, time, timeZone);
  if (result.kind !== 'ok') throw new Error(`${date} ${time} is ${result.kind} in ${timeZone}`);
  return result.instant;
}

/** The local date in `timeZone`, `days` days from now (negative for the past). */
export function localDateFromNow(days: number, timeZone: string): string {
  return toLocal(new Date(Date.now() + days * 24 * 60 * 60 * 1000), timeZone).date;
}

/** Signs up a user and returns the agent with its user id. */
export async function signedInUser(
  app: NestExpressApplication,
  email: string,
  name = 'Test User',
): Promise<{ agent: Awaited<ReturnType<typeof signedInAgent>>; userId: string }> {
  const agent = await signedInAgent(app, { name, email, password: 'correct-horse-battery' });
  const res = await agent.get('/api/me').expect(200);
  const userId: unknown = res.body.id;
  if (typeof userId !== 'string') throw new Error('sign-up returned no user id');
  return { agent, userId };
}

// Mailpit's HTTP API sits next to its SMTP port (compose: mailpit, CI: localhost).
const MAILPIT_URL = `http://${process.env.SMTP_HOST ?? 'localhost'}:8025`;

export interface CaughtMail {
  subject: string;
  text: string;
}

/**
 * Polls Mailpit until at least one message to `to` has a subject starting with
 * `subjectPrefix`, and returns every such message. Use a unique address per test.
 */
export async function waitForMail(
  to: string,
  subjectPrefix: string,
  timeoutMs = 60_000,
): Promise<CaughtMail[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const query = encodeURIComponent(`to:"${to}"`);
    const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${query}`);
    if (!res.ok) throw new Error(`Mailpit search failed with ${res.status}`);
    const { messages } = (await res.json()) as { messages: { ID: string; Subject: string }[] };
    const matching = messages.filter((m) => m.Subject.startsWith(subjectPrefix));
    if (matching.length > 0) {
      return Promise.all(
        matching.map(async (m) => {
          const message = await fetch(`${MAILPIT_URL}/api/v1/message/${m.ID}`);
          const body = (await message.json()) as { Subject: string; Text: string };
          return { subject: body.Subject, text: body.Text };
        }),
      );
    }
    if (Date.now() > deadline) throw new Error(`No mail to ${to} within ${timeoutMs} ms`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
