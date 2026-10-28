import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { lockSeats } from '../src/bookings/seat-lock.js';
import { PG_POOL } from '../src/db/db.module.js';
import { booking, occupancyMark, seat, seatHold, space } from '../src/db/schema/index.js';
import { insertHold, insertPassBooking, localInstant, signedInUser, testDb } from './fixtures.js';
import { createTestApp, resetDb, signedInAgent } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;
const ZONE = 'Asia/Kolkata';
const MONDAY = '2030-01-07';
const day = (n: number, from = MONDAY) =>
  new Date(Date.parse(from) + n * 86_400_000).toISOString().slice(0, 10);
const pw = 'correct-horse-battery';

describe('occupancy API (T047)', () => {
  let app: NestExpressApplication;
  let owner: Agent;
  let other: Agent;
  let renter: Agent;
  let renterId: string;
  let spaceId: string;
  let seatIds: string[];
  let base: string;
  const db = () => testDb(app);

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
          { slot: 'day', enabled: true, prices: { ...none, day: '500.00', week: '2800' } },
          { slot: 'night', enabled: true, prices: { ...none, week: '2000' } },
          { slot: 'full_day', enabled: true, prices: { ...none, week: '4500' } },
        ],
      })
      .expect(200);
    const created = await db()
      .insert(seat)
      .values(['A1', 'A2', 'A3'].map((label) => ({ spaceId, label })))
      .returning();
    seatIds = created.sort((a, b) => a.label.localeCompare(b.label)).map((x) => x.id);
    await db().update(space).set({ status: 'published' }).where(eq(space.id, spaceId));
    base = `/api/owner/spaces/${spaceId}/occupancy`;
  });
  afterAll(() => app.close());

  const s = (i: number): string => String(seatIds[i]);
  const markId = (body: { body: { items: { id: string }[] } }): string =>
    String(body.body.items[0]?.id);
  const mark = (body: Record<string, unknown>, agent: Agent = owner) =>
    agent.post(base).send({ startDate: MONDAY, endDate: null, note: null, ...body });
  const nightOrDay = (date: string, kind: 'day' | 'night') =>
    kind === 'day'
      ? [localInstant(date, '07:00', ZONE), localInstant(date, '19:00', ZONE)]
      : [localInstant(date, '19:00', ZONE), localInstant(day(1, date), '07:00', ZONE)];
  async function book(seatId: string, date: string, kind: 'day' | 'night' = 'day') {
    const [startsAt, endsAt] = nightOrDay(date, kind);
    if (!startsAt || !endsAt) throw new Error('window');
    const b = await insertPassBooking(db(), {
      seatId,
      userId: renterId,
      startsAt,
      endsAt,
      pass: 'day',
      slot: kind,
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

  it('marks two seats from a date with no end, hides the note from renters (AC 5.1)', async () => {
    const res = await mark({ seatIds: [s(0), s(1)], note: 'Acme Ltd' }).expect(201);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({
      startDate: MONDAY,
      endDate: null,
      note: 'Acme Ltd',
      endsAt: null,
      status: 'active',
      startsAt: localInstant(MONDAY, '07:00', ZONE).toISOString(),
    });
    const avail = await renter
      .get(`/api/listings/${spaceId}/seats?pass=week&slot=day&startDate=${day(7)}`)
      .expect(200);
    const statuses = Object.fromEntries(
      (avail.body.seats as { id: string; status: string }[]).map((x) => [x.id, x.status]),
    );
    expect(statuses).toMatchObject({ [s(0)]: 'taken', [s(1)]: 'taken', [s(2)]: 'free' });
    expect(JSON.stringify(avail.body)).not.toContain('Acme');
    const detail = await renter.get(`/api/listings/${spaceId}`).expect(200);
    expect(JSON.stringify(detail.body)).not.toContain('Acme');
    const list = await owner.get(base).expect(200);
    expect(list.body.items).toHaveLength(2);
    const one = await owner.get(`${base}?seatId=${s(1)}`).expect(200);
    expect(one.body.items).toHaveLength(1);
  });

  it('refuses over a renter booking and lists the dates, creating nothing (AC 5.3)', async () => {
    await book(s(0), day(2));
    const res = await mark({ seatIds: [s(0), s(1)], endDate: day(4) }).expect(409);
    expect(res.body).toMatchObject({
      type: 'urn:bseat:problem:occupancy:conflicts-with-bookings',
      conflicts: [{ seatId: s(0), label: 'A1', bookedDates: [day(2)], marks: [] }],
    });
    expect(await db().select().from(occupancyMark)).toHaveLength(0);
  });

  it('refuses an overlapping open-ended mark as already occupied (AQ-3)', async () => {
    const first = await mark({ seatIds: [s(0)] }).expect(201);
    const res = await mark({ seatIds: [s(0), s(1)], startDate: day(3) }).expect(409);
    expect(res.body).toMatchObject({
      type: 'urn:bseat:problem:occupancy:already-occupied',
      conflicts: [
        {
          seatId: s(0),
          bookedDates: [],
          marks: [{ id: first.body.items[0].id, startDate: MONDAY, endDate: null }],
        },
      ],
    });
    expect(await db().select().from(occupancyMark)).toHaveLength(1);
  });

  it('does not clip the night booking of the day before the mark (R-11)', async () => {
    await book(s(0), day(-1), 'night');
    await mark({ seatIds: [s(0)] }).expect(201);
  });

  it('treats the end date as inclusive', async () => {
    const res = await mark({ seatIds: [s(0)], endDate: MONDAY }).expect(201);
    expect(res.body.items[0].endsAt).toBe(localInstant(day(1), '07:00', ZONE).toISOString());
  });

  it('validates input (400) and requires sign-in (401) and the owner role (403)', async () => {
    await mark({ seatIds: [] }).expect(400);
    await mark({ seatIds: ['nope'] }).expect(400);
    await mark({ seatIds: [s(0)], endDate: day(-1) }).expect(400);
    await mark({ seatIds: [s(0)], note: 'x'.repeat(201) }).expect(400);
    await mark({ seatIds: Array.from({ length: 201 }, () => randomUUID()) }).expect(400);
    await mark({ seatIds: [s(0)], extra: 1 }).expect(400);
    await owner.get(`${base}?seatId=nope`).expect(400);
    await owner.post(`${base}/not-a-uuid/end`).expect(400);
    const { default: request } = await import('supertest');
    await request(app.getHttpServer()).get(base).expect(401);
    await mark({ seatIds: [s(0)] }, renter).expect(403);
  });

  it("gives one generic 404 for another owner's space or a foreign seat", async () => {
    await mark({ seatIds: [s(0)] }, other).expect(404);
    await other.get(base).expect(404);
    const ghost = randomUUID();
    const res = await mark({ seatIds: [s(0), ghost] }).expect(404);
    expect(JSON.stringify(res.body)).not.toContain(ghost);
    await db()
      .update(seat)
      .set({ removedAt: new Date() })
      .where(eq(seat.id, s(2)));
    await mark({ seatIds: [s(2)] }).expect(404);
    expect(await db().select().from(occupancyMark)).toHaveLength(0);
    const made = { id: markId(await mark({ seatIds: [s(0)] }).expect(201)) };
    await other.post(`${base}/${made.id}/end`).expect(404);
    await owner.post(`${base}/${randomUUID()}/end`).expect(404);
  });

  it('allows marks on a draft space', async () => {
    await db().update(space).set({ status: 'draft' }).where(eq(space.id, spaceId));
    await mark({ seatIds: [s(0)] }).expect(201);
  });

  it('ends an active mark now so the seat is bookable again (AC 5.2)', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const made = { id: markId(await mark({ seatIds: [s(0)], startDate: yesterday }).expect(201)) };
    const res = await owner.post(`${base}/${made.id}/end`).expect(200);
    expect(res.body).toMatchObject({ id: made.id, status: 'ended' });
    const [hold] = await db().select().from(seatHold).where(eq(seatHold.occupancyMarkId, made.id));
    expect(hold?.active).toBe(true);
    expect(hold?.endsAt && hold.endsAt.getTime() <= Date.now()).toBe(true);
    const later = new Date(Date.now() + 3_600_000);
    await insertHold(db(), {
      seatId: s(0),
      userId: renterId,
      bookingId: (
        await insertPassBooking(db(), {
          seatId: s(0),
          userId: renterId,
          startsAt: later,
          endsAt: new Date(later.getTime() + 3_600_000),
        })
      ).id,
      startsAt: later,
      endsAt: new Date(later.getTime() + 3_600_000),
    });
    expect((await owner.get(base).expect(200)).body.items).toHaveLength(0);
    const again = await owner.post(`${base}/${made.id}/end`).expect(200);
    expect(again.body.status).toBe('ended');
  });

  it('deactivates a mark that has not started yet (AC 5.2)', async () => {
    const made = { id: markId(await mark({ seatIds: [s(0)] }).expect(201)) };
    const res = await owner.post(`${base}/${made.id}/end`).expect(200);
    expect(res.body.status).toBe('ended');
    const [hold] = await db().select().from(seatHold).where(eq(seatHold.occupancyMarkId, made.id));
    expect(hold?.active).toBe(false);
    await mark({ seatIds: [s(0)] }).expect(201);
  });

  it('shows today as vacant, occupied with the note, or booked (AC 5.4)', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = day(-1, today);
    const made = {
      id: markId(
        await mark({ seatIds: [s(0)], startDate: yesterday, note: 'Acme Ltd' }).expect(201),
      ),
    };
    const now = new Date();
    const b = await insertPassBooking(db(), {
      seatId: s(1),
      userId: renterId,
      startsAt: new Date(now.getTime() - 3_600_000),
      endsAt: new Date(now.getTime() + 3_600_000),
    });
    await insertHold(db(), {
      seatId: s(1),
      userId: renterId,
      bookingId: b.id,
      startsAt: new Date(now.getTime() - 3_600_000),
      endsAt: new Date(now.getTime() + 3_600_000),
    });
    const res = await owner.get(`/api/owner/spaces/${spaceId}/seats`).expect(200);
    const byLabel = Object.fromEntries(
      (res.body.items as { label: string; today: unknown }[]).map((x) => [x.label, x.today]),
    );
    expect(byLabel).toEqual({
      A1: { state: 'occupied', note: 'Acme Ltd', markId: made.id },
      A2: { state: 'booked', note: null, markId: null },
      A3: { state: 'vacant', note: null, markId: null },
    });
  });

  it('lets exactly one of two opposite-order overlapping creates win, with no 500', async () => {
    const [x, y] = await Promise.all([
      mark({ seatIds: [s(0), s(1), s(2)] }),
      mark({ seatIds: [s(2), s(1), s(0)] }),
    ]);
    expect([x.status, y.status].sort()).toEqual([201, 409]);
    expect(await db().select().from(occupancyMark)).toHaveLength(3);
  });

  it('lets exactly one of a racing mark and booking write win', async () => {
    const [startsAt, endsAt] = nightOrDay(MONDAY, 'day');
    if (!startsAt || !endsAt) throw new Error('window');
    const racer = db().transaction(async (tx) => {
      await lockSeats(tx, [s(0)]);
      const [b] = await tx
        .insert(booking)
        .values({
          seatId: s(0),
          userId: renterId,
          spaceId,
          kind: 'pass',
          pass: 'day',
          slot: 'day',
          startDate: MONDAY,
          endDate: MONDAY,
          price: '10.00',
          currency: 'INR',
          startsAt,
          endsAt,
        })
        .returning();
      await tx.insert(seatHold).values({
        seatId: s(0),
        userId: renterId,
        bookingId: b?.id,
        startsAt,
        endsAt,
        serviceDate: MONDAY,
      });
    });
    const res = await mark({ seatIds: [s(0)], endDate: MONDAY });
    const booked = await racer.then(
      () => true,
      () => false,
    );
    expect(res.status).not.toBe(500);
    expect(Number(res.status === 201) + Number(booked)).toBe(1);
  });

  it('does not deadlock when marking races a seat delete', async () => {
    for (let round = 0; round < 5; round += 1) {
      const target = String(
        (
          await db()
            .insert(seat)
            .values({ spaceId, label: `R-${round}` })
            .returning()
        )[0]?.id,
      );
      const [m, d] = await Promise.all([
        mark({ seatIds: [target] }),
        owner.delete(`/api/owner/spaces/${spaceId}/seats/${target}`),
      ]);
      expect(m.status).not.toBe(500);
      expect(d.status).not.toBe(500);
    }
  });

  it('fails within about 5 s with a 500 when a seat lock is held, creating nothing', async () => {
    const pool = app.get<pg.Pool>(PG_POOL);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`select pg_advisory_xact_lock(1112735745, hashtext($1::uuid::text))`, [
        s(0),
      ]);
      const started = Date.now();
      const res = await mark({ seatIds: [s(0)] });
      expect(res.status).toBe(500);
      expect(Date.now() - started).toBeLessThan(9000);
    } finally {
      await client.query('rollback');
      client.release();
    }
    expect(await db().select().from(occupancyMark)).toHaveLength(0);
  }, 20_000);
});
