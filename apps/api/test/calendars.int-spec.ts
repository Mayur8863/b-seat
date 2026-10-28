import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, eq, isNull } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { availabilityCalendar, booking, seat, seatHold, space } from '../src/db/schema/index.js';
import { insertHold, insertPassBooking, localInstant, signedInUser, testDb } from './fixtures.js';
import { createTestApp, resetDb, signedInAgent } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;
const ZONE = 'Asia/Kolkata';
const pw = 'correct-horse-battery';
const ALL = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const FUTURE_WED = '2099-01-07'; // a Wednesday
const FUTURE_MON = '2099-01-05';
const FUTURE_SAT = '2099-01-10';

describe('calendars API (T051)', () => {
  let app: NestExpressApplication;
  let owner: Agent;
  let other: Agent;
  let renter: Agent;
  let renterId: string;
  let spaceId: string;
  let seatIds: string[];
  const db = () => testDb(app);
  const s = (i: number): string => String(seatIds[i]);
  const shared = () => `/api/owner/spaces/${spaceId}/calendars/shared`;
  const own = (i: number) => `/api/owner/spaces/${spaceId}/seats/${s(i)}/calendar`;
  const input = (over: Record<string, unknown> = {}) => ({
    startDate: '2099-01-01',
    endDate: null,
    weekdays: ALL,
    ...over,
  });

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(app);
    owner = await signedInAgent(app, { name: 'O', email: 'o@example.com', password: pw }, 'owner');
    other = await signedInAgent(app, { name: 'P', email: 'p@example.com', password: pw }, 'owner');
    const r = await signedInUser(app, 'r@example.com');
    renter = r.agent;
    renterId = r.userId;
    spaceId = String(
      (
        await owner.post('/api/owner/spaces').send({
          name: 'Baner Hub',
          description: 'A bright shared office.',
          country: 'IN',
          city: 'Pune',
          area: 'Baner',
          streetAddress: '1 Test Road',
          timeZone: ZONE,
          currency: 'INR',
          openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
        })
      ).body.id,
    );
    const none = { day: null, week: null, month: null };
    await owner
      .put(`/api/owner/spaces/${spaceId}/pricing`)
      .send({
        slots: [
          { slot: 'day', enabled: true, prices: { ...none, day: '500.00' } },
          { slot: 'night', enabled: false, prices: none },
          { slot: 'full_day', enabled: false, prices: none },
        ],
      })
      .expect(200);
    const created = await db()
      .insert(seat)
      .values(['A1', 'A2'].map((label) => ({ spaceId, label })))
      .returning();
    seatIds = created.sort((a, b) => a.label.localeCompare(b.label)).map((x) => x.id);
    await db().update(space).set({ status: 'published' }).where(eq(space.id, spaceId));
  });
  afterAll(() => app.close());

  async function bookWednesday(seatId: string, date = FUTURE_WED) {
    const startsAt = localInstant(date, '07:00', ZONE);
    const endsAt = localInstant(date, '19:00', ZONE);
    const b = await insertPassBooking(db(), {
      seatId,
      userId: renterId,
      startsAt,
      endsAt,
      pass: 'day',
      slot: 'day',
      startDate: date,
      endDate: date,
    });
    await insertHold(db(), {
      seatId,
      userId: renterId,
      bookingId: b.id,
      startsAt,
      endsAt,
      serviceDate: date,
    });
  }
  const statuses = async (date: string) =>
    (
      (await renter.get(`/api/listings/${spaceId}/seats?pass=day&slot=day&startDate=${date}`))
        .body as { seats: { label: string; status: string }[] }
    ).seats.map((x) => [x.label, x.status]);

  it('returns the default shared calendar and no seat calendars (AC 6.1)', async () => {
    const res = await owner.get(`/api/owner/spaces/${spaceId}/calendars`).expect(200);
    expect(res.body.shared).toMatchObject({ endDate: null, weekdays: ALL });
    expect(res.body.shared.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(res.body.seats).toEqual([]);
  });

  it('closes seats on a Mon-Fri shared calendar for a Saturday start (AC 6.2)', async () => {
    const res = await owner
      .put(shared())
      .send(
        input({
          startDate: '2099-01-01',
          endDate: '2099-03-31',
          weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
        }),
      )
      .expect(200);
    expect(res.body).toEqual({
      calendar: {
        startDate: '2099-01-01',
        endDate: '2099-03-31',
        weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      },
      bookingsOutsideCalendar: 0,
    });
    expect(await statuses(FUTURE_SAT)).toEqual([
      ['A1', 'closed'],
      ['A2', 'closed'],
    ]);
    expect(await statuses(FUTURE_MON)).toEqual([
      ['A1', 'free'],
      ['A2', 'free'],
    ]);
  });

  it('gives a seat its own calendar and switches it back (AC 6.3)', async () => {
    await owner
      .put(shared())
      .send(input({ weekdays: ['mon', 'tue'] }))
      .expect(200);
    const put = await owner
      .put(own(0))
      .send(input({ weekdays: ['sat'] }))
      .expect(200);
    expect(put.body.calendar.weekdays).toEqual(['sat']);
    expect(await statuses(FUTURE_SAT)).toEqual([
      ['A1', 'free'],
      ['A2', 'closed'],
    ]);
    const list = await owner.get(`/api/owner/spaces/${spaceId}/calendars`).expect(200);
    expect(list.body.seats).toEqual([
      { seatId: s(0), label: 'A1', calendar: expect.objectContaining({ weekdays: ['sat'] }) },
    ]);
    const seats = await owner.get(`/api/owner/spaces/${spaceId}/seats`).expect(200);
    const items = seats.body.items as { calendar: string }[];
    expect(items.map((x) => x.calendar)).toEqual(['own', 'shared']);

    const del = await owner.delete(own(0)).expect(200);
    expect(del.body).toEqual({ calendar: null, bookingsOutsideCalendar: 0 });
    expect(await statuses(FUTURE_SAT)).toEqual([
      ['A1', 'closed'],
      ['A2', 'closed'],
    ]);
  });

  it('accepts a start date in the past (OQ-T46-4)', async () => {
    await owner
      .put(shared())
      .send(input({ startDate: '2001-01-01' }))
      .expect(200);
  });

  it('counts bookings that fall outside the new calendar and leaves them alone (AC 6.5)', async () => {
    await bookWednesday(s(0));
    await bookWednesday(s(1), '2099-01-14');
    const res = await owner
      .put(shared())
      .send(input({ weekdays: ['mon', 'tue', 'thu', 'fri', 'sat', 'sun'] }))
      .expect(200);
    expect(res.body.bookingsOutsideCalendar).toBe(2);
    expect(await db().select().from(booking)).toHaveLength(2);
    const holds = await db().select().from(seatHold);
    expect(holds).toHaveLength(2);
    expect(holds.every((h) => h.active)).toBe(true);
  });

  it('counts only seats that use the shared calendar for a shared change', async () => {
    await bookWednesday(s(0));
    await bookWednesday(s(1), '2099-01-14');
    await owner.put(own(1)).send(input()).expect(200);
    const res = await owner
      .put(shared())
      .send(input({ weekdays: ['mon'] }))
      .expect(200);
    expect(res.body.bookingsOutsideCalendar).toBe(1);
    const seatRes = await owner
      .put(own(1))
      .send(input({ weekdays: ['mon'] }))
      .expect(200);
    expect(seatRes.body.bookingsOutsideCalendar).toBe(1);
  });

  it('does not count cancelled bookings', async () => {
    await bookWednesday(s(0));
    await db().update(booking).set({ status: 'cancelled', cancelledAt: new Date() });
    const res = await owner
      .put(shared())
      .send(input({ weekdays: ['mon'] }))
      .expect(200);
    expect(res.body.bookingsOutsideCalendar).toBe(0);
  });

  it('counts the seat against the shared calendar when it switches back', async () => {
    await bookWednesday(s(0));
    await owner
      .put(shared())
      .send(input({ weekdays: ['mon'] }))
      .expect(200);
    await owner.put(own(0)).send(input()).expect(200);
    const del = await owner.delete(own(0)).expect(200);
    expect(del.body.bookingsOutsideCalendar).toBe(1);
  });

  it('fails closed when the shared calendar is missing', async () => {
    await db()
      .delete(availabilityCalendar)
      .where(and(eq(availabilityCalendar.spaceId, spaceId), isNull(availabilityCalendar.seatId)));
    await owner.get(`/api/owner/spaces/${spaceId}/calendars`).expect(404);
    await bookWednesday(s(0));
    const del = await owner.delete(own(0)).expect(200);
    expect(del.body).toEqual({ calendar: null, bookingsOutsideCalendar: 1 });
    const put = await owner.put(shared()).send(input()).expect(200);
    expect(put.body.bookingsOutsideCalendar).toBe(0);
  });

  it('rejects invalid bodies with 400', async () => {
    await owner
      .put(shared())
      .send(input({ endDate: '2098-12-31' }))
      .expect(400);
    await owner
      .put(shared())
      .send(input({ weekdays: [] }))
      .expect(400);
    await owner
      .put(shared())
      .send(input({ weekdays: ['mon', 'mon'] }))
      .expect(400);
    await owner
      .put(shared())
      .send(input({ weekdays: ['funday'] }))
      .expect(400);
    await owner
      .put(own(0))
      .send({ ...input(), extra: 1 })
      .expect(400);
    await owner.put(own(0)).send({}).expect(400);
  });

  it('requires a signed-in owner and hides other owners spaces', async () => {
    const anon = request(app.getHttpServer());
    await anon.get(`/api/owner/spaces/${spaceId}/calendars`).expect(401);
    await renter.get(`/api/owner/spaces/${spaceId}/calendars`).expect(403);
    await other.get(`/api/owner/spaces/${spaceId}/calendars`).expect(404);
    await other.put(shared()).send(input()).expect(404);
    await other.put(own(0)).send(input()).expect(404);
    await other.delete(own(0)).expect(404);
  });

  it('404s for a seat of another space or an unknown seat', async () => {
    const otherSpace = String(
      (
        await other.post('/api/owner/spaces').send({
          name: 'Other Hub',
          description: 'A bright shared office.',
          country: 'IN',
          city: 'Pune',
          area: 'Baner',
          streetAddress: '2 Test Road',
          timeZone: ZONE,
          currency: 'INR',
          openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
        })
      ).body.id,
    );
    await owner
      .put(`/api/owner/spaces/${otherSpace}/seats/${s(0)}/calendar`)
      .send(input())
      .expect(404);
    await owner
      .put(`/api/owner/spaces/${spaceId}/seats/${crypto.randomUUID()}/calendar`)
      .send(input())
      .expect(404);
    await owner
      .delete(`/api/owner/spaces/${spaceId}/seats/${crypto.randomUUID()}/calendar`)
      .expect(404);
  });
});
