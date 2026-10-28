import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, eq, isNull } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { availabilityCalendar, booking, seat, space } from '../src/db/schema/index.js';
import {
  createCubicle,
  insertHold,
  insertOccupancyMark,
  insertPassBooking,
  localInstant,
  signedInUser,
  testDb,
} from './fixtures.js';
import { createTestApp, resetDb, signedInAgent } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;
const str = (v: unknown): string => {
  if (typeof v !== 'string') throw new Error('expected a string');
  return v;
};
const none = { day: null, week: null, month: null };
const slot = (kind: string, enabled: boolean, prices: Record<string, string | null> = {}) => ({
  slot: kind,
  enabled,
  prices: { ...none, ...prices },
});
interface SeatBody {
  id: string;
  label: string;
  status: string;
  firstStartsAt: string | null;
  lastEndsAt: string | null;
  includedDates: number;
  closedDates: string[];
  cubicle: { id: string; name: string } | null;
  features: string[];
}

const ZONE = 'Asia/Kolkata';
const MONDAY = '2030-01-07';

describe('seat availability API', () => {
  let app: NestExpressApplication;
  let owner: Agent;
  let renter: Agent;
  let renterId: string;
  let ownerId: string;
  let id: string;
  let seatIds: string[];
  const url = (q: string, s = id) => `/api/listings/${s}/seats?${q}`;
  const week = (slotKind = 'day', start = MONDAY) =>
    url(`pass=week&slot=${slotKind}&startDate=${start}`);
  const seats = (body: unknown): SeatBody[] => (body as { seats: SeatBody[] }).seats;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(app);
    owner = await signedInAgent(
      app,
      { name: 'O', email: 'o@example.com', password: 'correct-horse-battery' },
      'owner',
    );
    const r = await signedInUser(app, 'r@example.com');
    renter = r.agent;
    renterId = r.userId;
    id = str(
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
    await owner
      .put(`/api/owner/spaces/${id}/pricing`)
      .send({
        slots: [
          slot('day', true, { day: '500.00', week: '2800' }),
          slot('night', true, { week: '2000' }),
          slot('full_day', true, { week: '4500' }),
        ],
      })
      .expect(200);
    const created = await testDb(app)
      .insert(seat)
      .values(['A1', 'A2', 'A3', 'A4', 'A5', 'A6'].map((label) => ({ spaceId: id, label })))
      .returning();
    seatIds = created.sort((a, b) => a.label.localeCompare(b.label)).map((x) => x.id);
    await testDb(app).update(space).set({ status: 'published' }).where(eq(space.id, id));
    const [row] = await testDb(app)
      .select({ id: space.ownerId })
      .from(space)
      .where(eq(space.id, id));
    ownerId = str(row?.id);
  });
  afterAll(() => app.close());

  /** An active weekly day-slot booking: one hold on the first day is enough to overlap. */
  async function holdDay(seatId: string, slotKind: 'day' | 'night' | 'full_day', date = MONDAY) {
    const [from, to] =
      slotKind === 'day'
        ? [localInstant(date, '07:00', ZONE), localInstant(date, '19:00', ZONE)]
        : slotKind === 'night'
          ? [localInstant(date, '19:00', ZONE), localInstant(nextDay(date), '07:00', ZONE)]
          : [localInstant(date, '07:00', ZONE), localInstant(nextDay(date), '07:00', ZONE)];
    const b = await insertPassBooking(testDb(app), {
      seatId,
      userId: renterId,
      startsAt: from,
      endsAt: to,
      pass: 'week',
      slot: slotKind,
      startDate: date,
      endDate: new Date(Date.parse(date) + 6 * 86400000).toISOString().slice(0, 10),
    });
    await insertHold(testDb(app), {
      seatId,
      userId: renterId,
      bookingId: b.id,
      startsAt: from,
      endsAt: to,
      serviceDate: date,
    });
  }
  const nextDay = (d: string) => new Date(Date.parse(d) + 86400000).toISOString().slice(0, 10);

  it('lists seat labels in natural order (M-2 before M-10)', async () => {
    await testDb(app)
      .insert(seat)
      .values(['M-10', 'M-2', 'M-1', 'M-12', 'M-11'].map((label) => ({ spaceId: id, label })));
    const res = await renter.get(week());
    const labels = (res.body as { seats: { label: string }[] }).seats.map((x) => x.label);
    expect(labels).toEqual([
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
      'A6',
      'M-1',
      'M-2',
      'M-10',
      'M-11',
      'M-12',
    ]);
  });

  it('marks a booked seat taken and reports the period (AC 4.4)', async () => {
    await holdDay(str(seatIds[2]), 'day');
    const res = await renter.get(week());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      space: { id, name: 'Baner Hub', timeZone: ZONE },
      pass: 'week',
      slot: 'day',
      startDate: MONDAY,
      endDate: '2030-01-13',
      slotTimes: { startTime: '07:00', endTime: '19:00', endsNextDay: false },
      price: '2800.00',
    });
    const list = seats(res.body);
    expect(list.map((s) => s.label)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5', 'A6']);
    expect(list.filter((s) => s.status === 'free')).toHaveLength(5);
    expect(list.find((s) => s.label === 'A3')?.status).toBe('taken');
    const free = list[0];
    expect(free).toMatchObject({
      firstStartsAt: localInstant(MONDAY, '07:00', ZONE).toISOString(),
      lastEndsAt: localInstant('2030-01-13', '19:00', ZONE).toISOString(),
      includedDates: 7,
      closedDates: [],
    });
  });

  it('keeps day and night apart but full_day blocks both', async () => {
    await holdDay(str(seatIds[0]), 'day');
    const night = await renter.get(week('night'));
    expect(seats(night.body).every((s) => s.status === 'free')).toBe(true);
    expect(night.body.slotTimes).toEqual({
      startTime: '19:00',
      endTime: '07:00',
      endsNextDay: true,
    });
    expect(seats(night.body)[0]?.lastEndsAt).toBe(
      localInstant('2030-01-14', '07:00', ZONE).toISOString(),
    );
    const full = await renter.get(week('full_day'));
    expect(seats(full.body)[0]?.status).toBe('taken');
    expect(seats(full.body)[1]?.status).toBe('free');
  });

  it('ignores cancelled bookings', async () => {
    await holdDay(str(seatIds[0]), 'day');
    await testDb(app).update(booking).set({ status: 'cancelled', cancelledAt: new Date() });
    const res = await renter.get(week());
    expect(seats(res.body).every((s) => s.status === 'free')).toBe(true);
  });

  it('treats an occupancy mark as taken and never shows its note (FR-022)', async () => {
    const mark = await insertOccupancyMark(testDb(app), {
      seatId: str(seatIds[1]),
      createdBy: ownerId,
      startDate: MONDAY,
      endDate: MONDAY,
      note: 'secret note',
    });
    await insertHold(testDb(app), {
      seatId: str(seatIds[1]),
      occupancyMarkId: mark.id,
      startsAt: localInstant(MONDAY, '07:00', ZONE),
      endsAt: localInstant(nextDay(MONDAY), '07:00', ZONE),
    });
    const res = await renter.get(week());
    expect(seats(res.body)[1]?.status).toBe('taken');
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('closes a seat whose own calendar closes the start date, with cubicle and features', async () => {
    const db = testDb(app);
    const cub = await createCubicle(db, id, { name: 'Bay 7' });
    await db
      .update(seat)
      .set({ cubicleId: cub.id, features: ['monitor'] })
      .where(eq(seat.id, str(seatIds[0])));
    await db.insert(availabilityCalendar).values({
      spaceId: id,
      seatId: str(seatIds[0]),
      startDate: '2030-01-01',
      weekdays: 62, // Tue-Sat: Monday is closed
    });
    const res = await renter.get(week());
    const first = seats(res.body)[0];
    expect(first).toMatchObject({
      status: 'closed',
      firstStartsAt: null,
      lastEndsAt: null,
      cubicle: { id: cub.id, name: 'Bay 7' },
      features: ['monitor'],
    });
  });

  it('skips closed days of a Mon-Fri shared calendar (AC 6.4)', async () => {
    await testDb(app)
      .update(availabilityCalendar)
      .set({ weekdays: 31, startDate: '2030-01-01' })
      .where(and(eq(availabilityCalendar.spaceId, id), isNull(availabilityCalendar.seatId)));
    const res = await renter.get(week());
    expect(seats(res.body)[0]).toMatchObject({
      status: 'free',
      includedDates: 5,
      closedDates: ['2030-01-12', '2030-01-13'],
    });
  });

  it('fails closed when the shared calendar is missing', async () => {
    await testDb(app).delete(availabilityCalendar).where(eq(availabilityCalendar.spaceId, id));
    const res = await renter.get(week());
    expect(res.status).toBe(200);
    expect(seats(res.body).every((s) => s.status === 'closed')).toBe(true);
  });

  it('refuses a pass that is not offered with 422', async () => {
    const res = await renter.get(url(`pass=month&slot=day&startDate=${MONDAY}`));
    expect(res.status).toBe(422);
    expect(res.body.type).toBe('urn:bseat:problem:booking-rule:pass-not-offered');
    const off = await renter.get(week('working_hours'));
    expect(off.status).toBe(422);
  });

  it('refuses a disabled slot with 422', async () => {
    await owner
      .put(`/api/owner/spaces/${id}/pricing`)
      .send({
        slots: [
          slot('day', false, { week: '2800' }),
          slot('night', true, { week: '2000' }),
          slot('full_day', true, { week: '4500' }),
        ],
      })
      .expect(200);
    expect((await renter.get(week())).status).toBe(422);
  });

  it('returns 404 for a draft or unknown space', async () => {
    await testDb(app).update(space).set({ status: 'draft' }).where(eq(space.id, id));
    expect((await renter.get(week())).status).toBe(404);
    expect((await renter.get(week('day', MONDAY).replace(id, crypto.randomUUID()))).status).toBe(
      404,
    );
  });

  it('validates the query (400) and requires sign-in (401)', async () => {
    expect((await renter.get(url('pass=week&slot=day'))).status).toBe(400);
    expect((await renter.get(url(`pass=year&slot=day&startDate=${MONDAY}`))).status).toBe(400);
    expect((await renter.get(url('pass=week&slot=day&startDate=2030-02-31'))).status).toBe(400);
    expect((await request(app.getHttpServer()).get(week())).status).toBe(401);
  });

  it('lets the owner view their own space', async () => {
    expect((await owner.get(week())).status).toBe(200);
  });

  it('does not show empty availability for a space with no seats', async () => {
    const other = str(
      (
        await owner.post('/api/owner/spaces').send({
          name: 'Empty',
          description: 'd',
          country: 'IN',
          city: 'Pune',
          area: 'Baner',
          streetAddress: '2 Road',
          timeZone: ZONE,
          currency: 'INR',
          openingHours: { mode: 'fixed_hours', opensAt: '09:00', closesAt: '18:00' },
        })
      ).body.id,
    );
    await owner
      .put(`/api/owner/spaces/${other}/pricing`)
      .send({ slots: [slot('working_hours', true, { day: '100.00' })] })
      .expect(200);
    await testDb(app).update(space).set({ status: 'published' }).where(eq(space.id, other));
    const res = await renter.get(url(`pass=day&slot=working_hours&startDate=${MONDAY}`, other));
    expect(res.status).toBe(200);
    expect(res.body.seats).toEqual([]);
  });
});
