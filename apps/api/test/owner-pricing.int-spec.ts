import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { booking, passPrice } from '../src/db/schema/index.js';
import { createSeats, insertPassBooking, signedInUser, testDb } from './fixtures.js';
import { createTestApp, resetDb, signedInAgent } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;
const str = (v: unknown): string => {
  if (typeof v !== 'string') throw new Error('expected a string');
  return v;
};
const none = { day: null, week: null, month: null };
const slot = (kind: string, enabled = true, prices: Record<string, string | null> = {}) => ({
  slot: kind,
  enabled,
  prices: { ...none, ...prices },
});
const h24 = (over: Record<string, unknown> = {}) => ({
  name: 'Baner Hub',
  description: 'A bright shared office.',
  country: 'IN',
  city: 'Pune',
  area: 'Baner',
  streetAddress: '1 Test Road',
  timeZone: 'Asia/Kolkata',
  currency: 'INR',
  openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
  ...over,
});
const fixed = () =>
  h24({ openingHours: { mode: 'fixed_hours', opensAt: '09:00', closesAt: '18:00' } });

describe('owner pricing API', () => {
  let app: NestExpressApplication;
  let a: Agent;
  let b: Agent;
  let renter: Awaited<ReturnType<typeof signedInUser>>['agent'];
  let id: string;
  let fixedId: string;
  const url = (s = id) => `/api/owner/spaces/${s}/pricing`;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(app);
    const pw = 'correct-horse-battery';
    a = await signedInAgent(app, { name: 'A', email: 'a@example.com', password: pw }, 'owner');
    b = await signedInAgent(app, { name: 'B', email: 'b@example.com', password: pw }, 'owner');
    renter = (await signedInUser(app, 'r@example.com')).agent;
    id = str((await a.post('/api/owner/spaces').send(h24())).body.id);
    fixedId = str((await a.post('/api/owner/spaces').send(fixed())).body.id);
  });
  afterAll(() => app.close());

  const full = (over: Record<string, unknown>[] = []) => ({
    slots: [slot('day'), slot('night'), slot('full_day'), ...over],
  });

  it('returns three 24-hour slots with derived times (AC 3.1)', async () => {
    const put = await a.put(url()).send(full());
    expect(put.status).toBe(200);
    const res = await a.put(url()).send({ shiftChangeAt: '07:00', ...full() });
    expect(res.status).toBe(200);
    const got = await a.get(url());
    expect(got.status).toBe(200);
    expect(got.body.currency).toBe('INR');
    expect(got.body.slots).toEqual([
      {
        slot: 'day',
        enabled: true,
        startTime: '07:00',
        endTime: '19:00',
        endsNextDay: false,
        prices: none,
      },
      {
        slot: 'night',
        enabled: true,
        startTime: '19:00',
        endTime: '07:00',
        endsNextDay: true,
        prices: none,
      },
      {
        slot: 'full_day',
        enabled: true,
        startTime: '07:00',
        endTime: '07:00',
        endsNextDay: true,
        prices: none,
      },
    ]);
  });

  it('changes the shift change time', async () => {
    await a.put(url()).send({ shiftChangeAt: '06:30', ...full() });
    const got = await a.get(url());
    expect(got.body.slots[0]).toMatchObject({ startTime: '06:30', endTime: '18:30' });
    expect(got.body.openingHours).toEqual({ mode: 'always_open', shiftChangeAt: '06:30' });
  });

  it('rejects shiftChangeAt at or after noon and on fixed-hours spaces', async () => {
    expect((await a.put(url()).send({ shiftChangeAt: '12:00', ...full() })).status).toBe(400);
    const res = await a
      .put(url(fixedId))
      .send({ shiftChangeAt: '07:00', slots: [slot('working_hours')] });
    expect(res.status).toBe(400);
  });

  it('fixed hours: one working_hours slot, cannot disable or use day (AC 3.2)', async () => {
    const got = await a.get(url(fixedId));
    expect(got.body.slots).toEqual([
      {
        slot: 'working_hours',
        enabled: true,
        startTime: '09:00',
        endTime: '18:00',
        endsNextDay: false,
        prices: none,
      },
    ]);
    expect((await a.put(url(fixedId)).send({ slots: [slot('working_hours', false)] })).status).toBe(
      400,
    );
    expect((await a.put(url(fixedId)).send({ slots: [slot('day')] })).status).toBe(400);
  });

  it('requires each of the mode kinds exactly once', async () => {
    expect((await a.put(url()).send({ slots: [slot('day'), slot('night')] })).status).toBe(400);
    expect(
      (
        await a
          .put(url())
          .send({ slots: [slot('day'), slot('day'), slot('night'), slot('full_day')] })
      ).status,
    ).toBe(400);
    expect((await a.put(url()).send({ slots: [] })).status).toBe(400);
    expect((await a.put(url()).send({ slots: [slot('working_hours')] })).status).toBe(400);
  });

  it('a null price removes the pass (AC 3.3)', async () => {
    await a.put(url()).send({
      slots: [slot('day', true, { day: '10', week: '50' }), slot('night'), slot('full_day')],
    });
    await a.put(url()).send({
      slots: [slot('day', true, { day: '10', week: null }), slot('night'), slot('full_day')],
    });
    const got = await a.get(url());
    expect(got.body.slots[0].prices).toEqual({ day: '10.00', week: null, month: null });
    const rows = await testDb(app).select().from(passPrice).where(eq(passPrice.spaceId, id));
    expect(rows).toHaveLength(1);
  });

  it.each(['0', '0.00', '12.345', '-5', '1e3', '', ' 5', '10000000000', 'NaN'])(
    'rejects price %j (AC 3.4)',
    async (price) => {
      const res = await a
        .put(url())
        .send({ slots: [slot('day', true, { day: price }), slot('night'), slot('full_day')] });
      expect(res.status).toBe(400);
    },
  );

  it('rejects numbers and unknown fields', async () => {
    const bad = {
      slots: [
        { slot: 'day', enabled: true, prices: { ...none, day: 10 } },
        slot('night'),
        slot('full_day'),
      ],
    };
    expect((await a.put(url()).send(bad)).status).toBe(400);
    expect((await a.put(url()).send({ ...full(), extra: 1 })).status).toBe(400);
  });

  it('keeps prices of a disabled slot but offers nothing (OQ-E)', async () => {
    await a
      .put(url())
      .send({ slots: [slot('day'), slot('night', false, { day: '7.5' }), slot('full_day')] });
    const got = await a.get(url());
    expect(got.body.slots[1]).toMatchObject({
      slot: 'night',
      enabled: false,
      prices: { day: '7.50' },
    });
    const space1 = await a.get(`/api/owner/spaces/${id}`);
    expect(space1.body.hasOfferedPass).toBe(false);
    await a.put(url()).send({
      slots: [
        slot('day', true, { day: '9' }),
        slot('night', false, { day: '7.5' }),
        slot('full_day'),
      ],
    });
    expect((await a.get(`/api/owner/spaces/${id}`)).body.hasOfferedPass).toBe(true);
  });

  it('accepts two decimals for JPY (OQ-F)', async () => {
    const jpy = str((await a.post('/api/owner/spaces').send(h24({ currency: 'JPY' }))).body.id);
    const res = await a
      .put(url(jpy))
      .send({ slots: [slot('day', true, { day: '1500.50' }), slot('night'), slot('full_day')] });
    expect(res.status).toBe(200);
    expect((await a.get(url(jpy))).body.slots[0].prices.day).toBe('1500.50');
  });

  it('does not change existing bookings (AC 3.6)', async () => {
    await a
      .put(url())
      .send({ slots: [slot('day', true, { day: '500' }), slot('night'), slot('full_day')] });
    const db = testDb(app);
    const [s] = await createSeats(db, id, 1);
    if (!s) throw new Error('no seat');
    const userId = (await renter.get('/api/me')).body.id as string;
    const row = await insertPassBooking(db, {
      seatId: s.id,
      userId,
      startsAt: new Date('2030-01-01T00:00:00Z'),
      endsAt: new Date('2030-01-01T12:00:00Z'),
      price: '500.00',
    });
    await a
      .put(url())
      .send({ slots: [slot('day', true, { day: '600' }), slot('night'), slot('full_day')] });
    const [after] = await db.select().from(booking).where(eq(booking.id, row.id));
    expect(after?.price).toBe('500.00');
    expect((await a.get(url())).body.slots[0].prices.day).toBe('600.00');
  });

  it('bumps updated_at on a changed price', async () => {
    await a
      .put(url())
      .send({ slots: [slot('day', true, { day: '5' }), slot('night'), slot('full_day')] });
    const db = testDb(app);
    const where = and(eq(passPrice.spaceId, id), eq(passPrice.slot, 'day'));
    const [r1] = await db.select().from(passPrice).where(where);
    await new Promise((r) => setTimeout(r, 20));
    await a
      .put(url())
      .send({ slots: [slot('day', true, { day: '6' }), slot('night'), slot('full_day')] });
    const [r2] = await db.select().from(passPrice).where(where);
    expect(r2 && r1 && r2.updatedAt > r1.updatedAt).toBe(true);
  });

  it('is 404 for another owner, unknown id, 400 for bad id', async () => {
    expect((await b.get(url())).status).toBe(404);
    expect((await b.put(url()).send(full())).status).toBe(404);
    expect((await a.get(url('00000000-0000-4000-8000-000000000000'))).status).toBe(404);
    expect((await a.get('/api/owner/spaces/nope/pricing')).status).toBe(400);
  });

  it('is 401 signed out and 403 for a renter', async () => {
    const anon = (await import('supertest')).default(app.getHttpServer());
    expect((await anon.get(url())).status).toBe(401);
    expect((await renter.get(url())).status).toBe(403);
    expect((await renter.put(url()).send(full())).status).toBe(403);
  });
});
