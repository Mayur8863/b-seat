import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../src/db/db.js';
import { booking, seatHold, user } from '../src/db/schema/index.js';
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

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PREFIX = 'urn:bseat:problem:';

describe('my bookings (GET /api/bookings, POST /api/bookings/:id/cancel)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let spaceId: string;
  let seatIds: string[];
  let a: Agent;
  let aId: string;
  let b: Agent;
  let bId: string;

  const seatAt = (i: number) => seatIds[i] ?? '';

  /** A one-day pass with its single 12 h hold, starting `offsetMs` from now (negative = past). */
  const pass = async (
    userId: string,
    seatId: string,
    offsetMs: number,
    extra: Partial<typeof booking.$inferInsert> = {},
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
      active: row.status === 'active',
    });
    return row;
  };
  const holdsOf = (bookingId: string) =>
    db.select().from(seatHold).where(eq(seatHold.bookingId, bookingId));

  beforeAll(async () => {
    app = await createTestApp();
    db = testDb(app);
  });
  beforeEach(async () => {
    await resetDb(app);
    const owner = await signedInUser(app, 'owner@example.com', 'Owner');
    await db.update(user).set({ accountType: 'owner' }).where(eq(user.id, owner.userId));
    ({ agent: a, userId: aId } = await signedInUser(app, 'a@example.com', 'Renter A'));
    ({ agent: b, userId: bId } = await signedInUser(app, 'b@example.com', 'Renter B'));
    const s = await createListing(db, owner.userId, {
      status: 'published',
      timeZone: 'Asia/Kolkata',
      openingMode: 'always_open',
      shiftChangeAt: '07:00',
      opensAt: null,
      closesAt: null,
    });
    spaceId = s.id;
    seatIds = (await createSeats(db, spaceId, 5)).map((x) => x.id);
  });
  afterAll(() => app.close());

  describe('list', () => {
    it('401 when signed out', async () => {
      await request(app.getHttpServer()).get('/api/bookings').expect(401);
    });

    it("returns only the caller's active upcoming pass bookings, soonest first", async () => {
      const later = await pass(aId, seatAt(0), 3 * DAY);
      const sooner = await pass(aId, seatAt(1), 1 * DAY);
      await pass(aId, seatAt(2), -3 * DAY); // ended
      await pass(aId, seatAt(3), 2 * DAY, { status: 'cancelled' });
      await pass(bId, seatAt(4), 1 * DAY);
      // Legacy hourly rows cannot be inserted any more (booking_no_new_hourly); the
      // `kind = 'pass'` filter is covered by the query itself.
      const res = await a.get('/api/bookings').expect(200);
      const items = res.body.items as { id: string }[];
      expect(items.map((i) => i.id)).toEqual([sooner.id, later.id]);
      expect(res.body.items[0]).toMatchObject({
        status: 'active',
        pass: 'day',
        slot: 'day',
        timeZone: 'Asia/Kolkata',
        slotTimes: { startTime: '07:00', endTime: '19:00', endsNextDay: false },
        seat: { id: seatAt(1), label: 'S-02', cubicleName: null },
        space: { id: spaceId, area: 'Baner', city: 'Pune', country: 'IN' },
        price: { amount: '10.00', currency: 'GBP' },
        cancelledAt: null,
        skippedDates: [],
      });
      expect(res.body.items[0].days).toHaveLength(1);
      expect(res.body.items[0]).not.toHaveProperty('userId');
    });

    it('includes a booking that is in progress', async () => {
      const running = await pass(aId, seatAt(0), -1 * HOUR);
      const res = await a.get('/api/bookings').expect(200);
      expect((res.body.items as { id: string }[]).map((i) => i.id)).toEqual([running.id]);
    });

    it('limit=1 returns only the next booking', async () => {
      const next = await pass(aId, seatAt(0), 1 * DAY);
      await pass(aId, seatAt(1), 2 * DAY);
      const res = await a.get('/api/bookings?limit=1').expect(200);
      expect((res.body.items as { id: string }[]).map((i) => i.id)).toEqual([next.id]);
    });

    it('is empty for a renter without bookings', async () => {
      const res = await b.get('/api/bookings').expect(200);
      expect(res.body).toEqual({ items: [] });
    });

    it.each(['0', '51', 'x'])('400 for limit=%s', async (limit) => {
      await a.get(`/api/bookings?limit=${limit}`).expect(400);
    });
  });

  describe('cancel', () => {
    it('401 when signed out', async () => {
      await request(app.getHttpServer()).post(`/api/bookings/${randomUUID()}/cancel`).expect(401);
    });

    it('cancels an upcoming booking and frees every hold', async () => {
      const row = await pass(aId, seatAt(0), 1 * DAY);
      const res = await a.post(`/api/bookings/${row.id}/cancel`).expect(200);
      expect(res.body).toMatchObject({ id: row.id, status: 'cancelled' });
      expect(typeof res.body.cancelledAt).toBe('string');
      const holds = await holdsOf(row.id);
      expect(holds.length).toBeGreaterThan(0);
      expect(holds.every((h) => !h.active)).toBe(true);
      // The seat is free for the same period again (the exclusion constraint would refuse this).
      await insertHold(db, {
        seatId: seatAt(0),
        userId: bId,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
      });
      const list = await a.get('/api/bookings').expect(200);
      expect(list.body).toEqual({ items: [] });
    });

    it('409 already-started, and the booking stays active', async () => {
      const row = await pass(aId, seatAt(0), -1 * HOUR);
      const res = await a.post(`/api/bookings/${row.id}/cancel`).expect(409);
      expect(res.body.type).toBe(`${PREFIX}booking:already-started`);
      const [after] = await db.select().from(booking).where(eq(booking.id, row.id));
      expect(after?.status).toBe('active');
      expect((await holdsOf(row.id)).every((h) => h.active)).toBe(true);
    });

    it("404 identical to an unknown id for another renter's booking, which is unchanged", async () => {
      const row = await pass(aId, seatAt(0), 1 * DAY);
      const other = await b.post(`/api/bookings/${row.id}/cancel`).expect(404);
      const unknown = await b.post(`/api/bookings/${randomUUID()}/cancel`).expect(404);
      expect(other.body).toEqual(unknown.body);
      const [after] = await db.select().from(booking).where(eq(booking.id, row.id));
      expect(after?.status).toBe('active');
    });

    it('200 unchanged when cancelled again', async () => {
      const row = await pass(aId, seatAt(0), 1 * DAY);
      const first = await a.post(`/api/bookings/${row.id}/cancel`).expect(200);
      const second = await a.post(`/api/bookings/${row.id}/cancel`).expect(200);
      expect(second.body).toEqual(first.body);
    });

    it('400 for a malformed id', async () => {
      await a.post('/api/bookings/not-a-uuid/cancel').expect(400);
    });
  });
});
