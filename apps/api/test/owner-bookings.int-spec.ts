import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../src/db/db.js';
import { user } from '../src/db/schema/index.js';
import {
  createListing,
  createSeats,
  insertHold,
  insertPassBooking,
  signedInUser,
  testDb,
} from './fixtures.js';
import { createTestApp, resetDb } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signedInUser>>['agent'];
interface Item {
  id: string;
  renter: { name: string; email: string };
  firstStartsAt: string;
}
interface Page {
  items: Item[];
  nextCursor: string | null;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('owner bookings (GET /api/owner/spaces/:spaceId/bookings)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let ownerA: Agent;
  let ownerB: Agent;
  let spaceA: string;
  let spaceB: string;
  let seatsA: string[];
  let seatsB: string[];
  let r1: Agent;
  let r1Id: string;
  let r2Id: string;

  const seatA = (i: number) => seatsA[i] ?? '';
  const url = (spaceId: string, qs = '') => `/api/owner/spaces/${spaceId}/bookings${qs}`;

  /** A one-day pass with one 12 h hold on `serviceDate`, starting `offsetMs` from now. */
  const pass = async (
    userId: string,
    seatId: string,
    offsetMs: number,
    serviceDate?: string,
    extra: { status?: 'cancelled' } = {},
  ) => {
    const startsAt = new Date(Date.now() + offsetMs);
    const endsAt = new Date(startsAt.getTime() + 12 * HOUR);
    const row = await insertPassBooking(db, { seatId, userId, startsAt, endsAt, ...extra });
    await insertHold(db, {
      seatId,
      userId,
      bookingId: row.id,
      startsAt,
      endsAt,
      serviceDate: serviceDate ?? startsAt.toISOString().slice(0, 10),
      active: row.status === 'active',
    });
    return row;
  };
  const dateIn = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

  beforeAll(async () => {
    app = await createTestApp();
    db = testDb(app);
  });
  beforeEach(async () => {
    await resetDb(app);
    const a = await signedInUser(app, 'owner-a@example.com', 'Owner A');
    const b = await signedInUser(app, 'owner-b@example.com', 'Owner B');
    await db.update(user).set({ accountType: 'owner' }).where(eq(user.id, a.userId));
    await db.update(user).set({ accountType: 'owner' }).where(eq(user.id, b.userId));
    ownerA = a.agent;
    ownerB = b.agent;
    ({ agent: r1, userId: r1Id } = await signedInUser(app, 'r1@example.com', 'Renter One'));
    ({ userId: r2Id } = await signedInUser(app, 'r2@example.com', 'Renter Two'));
    const mk = async (ownerId: string) => {
      const s = await createListing(db, ownerId, {
        status: 'published',
        timeZone: 'Asia/Kolkata',
        openingMode: 'always_open',
        shiftChangeAt: '07:00',
        opensAt: null,
        closesAt: null,
      });
      return { id: s.id, seats: (await createSeats(db, s.id, 3)).map((x) => x.id) };
    };
    const sa = await mk(a.userId);
    const sb = await mk(b.userId);
    spaceA = sa.id;
    seatsA = sa.seats;
    spaceB = sb.id;
    seatsB = sb.seats;
  });
  afterAll(() => app.close());

  it('401 signed out, 403 for a renter', async () => {
    await request(app.getHttpServer()).get(url(spaceA)).expect(401);
    await r1.get(url(spaceA)).expect(403);
  });

  it("lists exactly the space's active upcoming bookings with renter and price", async () => {
    const first = await pass(r1Id, seatA(0), 1 * DAY);
    const second = await pass(r2Id, seatA(1), 2 * DAY);
    const third = await pass(r1Id, seatA(2), 3 * DAY);
    await pass(r2Id, seatsB[0] ?? '', 1 * DAY);
    await pass(r1Id, seatA(1), 5 * DAY, undefined, { status: 'cancelled' });
    await pass(r1Id, seatA(1), -3 * DAY);
    const res = await ownerA.get(url(spaceA)).expect(200);
    const page = res.body as Page;
    expect(page.items.map((i) => i.id)).toEqual([first.id, second.id, third.id]);
    expect(page.nextCursor).toBeNull();
    expect(page.items[0]).toMatchObject({
      status: 'active',
      renter: { name: 'Renter One', email: 'r1@example.com' },
      seat: { id: seatA(0), label: 'S-01' },
      pass: 'day',
      slot: 'day',
      timeZone: 'Asia/Kolkata',
      price: { amount: '10.00', currency: 'GBP' },
    });
  });

  it('filters by a day inside the range, and 400s on to < from or a bad cursor', async () => {
    const early = await pass(r1Id, seatA(0), 1 * DAY);
    const late = await pass(r2Id, seatA(1), 10 * DAY);
    const only = async (qs: string) =>
      ((await ownerA.get(url(spaceA, qs)).expect(200)).body as Page).items.map((i) => i.id);
    expect(await only(`?from=${dateIn(9)}&to=${dateIn(11)}`)).toEqual([late.id]);
    expect(await only(`?to=${dateIn(2)}`)).toEqual([early.id]);
    expect(await only(`?from=${dateIn(30)}`)).toEqual([]);
    await ownerA.get(url(spaceA, `?from=${dateIn(5)}&to=${dateIn(4)}`)).expect(400);
    await ownerA.get(url(spaceA, '?cursor=not-a-cursor')).expect(400);
    await ownerA.get(url(spaceA, '?limit=101')).expect(400);
    await ownerA.get(url(spaceA, '?from=tomorrow')).expect(400);
  });

  it('matches a booking by any of its days, not only the first', async () => {
    const multi = await pass(r1Id, seatA(0), 1 * DAY, dateIn(1));
    await insertHold(db, {
      seatId: seatA(0),
      userId: r1Id,
      bookingId: multi.id,
      startsAt: new Date(multi.startsAt.getTime() + 13 * HOUR),
      endsAt: new Date(multi.startsAt.getTime() + 25 * HOUR),
      serviceDate: dateIn(9),
    });
    const res = await ownerA.get(url(spaceA, `?from=${dateIn(8)}&to=${dateIn(10)}`)).expect(200);
    expect((res.body as Page).items.map((i) => i.id)).toEqual([multi.id]);
  });

  it('pages 120 bookings once each in starts_at, id order', async () => {
    const expected: string[] = [];
    for (let i = 0; i < 120; i += 1) {
      const row = await pass(i % 2 === 0 ? r1Id : r2Id, seatA(i % 3), HOUR + i * 13 * HOUR);
      expected.push(row.id);
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const qs: string = cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`;
      const body = (await ownerA.get(url(spaceA, qs)).expect(200)).body as Page;
      if (pages === 0) expect(body.items).toHaveLength(50);
      seen.push(...body.items.map((i) => i.id));
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor !== null);
    expect(pages).toBe(3);
    expect(seen).toEqual(expected);
  }, 60_000);

  it('honours limit', async () => {
    await pass(r1Id, seatA(0), 1 * DAY);
    await pass(r2Id, seatA(1), 2 * DAY);
    const body = (await ownerA.get(url(spaceA, '?limit=1')).expect(200)).body as Page;
    expect(body.items).toHaveLength(1);
    expect(body.nextCursor).not.toBeNull();
  });

  it('404 parity for another owner and an unknown space', async () => {
    await pass(r1Id, seatA(0), 1 * DAY);
    const other = await ownerB.get(url(spaceA)).expect(404);
    const unknown = await ownerB.get(url(randomUUID())).expect(404);
    expect(other.body.type).toBe(unknown.body.type);
    expect(other.body.detail).toBe(unknown.body.detail);
    await ownerB.get(url(spaceB)).expect(200);
  });
});
