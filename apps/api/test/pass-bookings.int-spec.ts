import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, eq, sql } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { BookingsService } from '../src/bookings/bookings.service.js';
import { SEAT_HOLD_LOCK_CLASS } from '../src/bookings/seat-lock.js';
import { addDays } from '../src/common/time/zoned-time.js';
import type { Database } from '../src/db/db.js';
import { PG_POOL } from '../src/db/db.module.js';
import {
  availabilityCalendar,
  booking,
  passPrice,
  seat,
  seatHold,
  space,
  user,
} from '../src/db/schema/index.js';
import {
  createListing,
  createSeats,
  insertHold,
  insertOccupancyMark,
  localDateFromNow,
  signedInUser,
  testDb,
  waitForMail,
} from './fixtures.js';
import { createTestApp, resetDb } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signedInUser>>['agent'];

const ZONE = 'Asia/Kolkata';
const PREFIX = 'urn:bseat:problem:';
const RETRY_LOG = 'booking.insert_deadlock_retry';

describe('create pass booking (POST /api/listings/:spaceId/bookings)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let pool: pg.Pool;
  let owner: Agent;
  let ownerId: string;
  let spaceId: string;
  let s0: string;
  let s1: string;
  let s2: string;
  let renter: Agent;
  let renterId: string;

  const start = () => localDateFromNow(3, ZONE);
  const post = (agent: Agent, body: Record<string, unknown>, sid = spaceId) =>
    agent.post(`/api/listings/${sid}/bookings`).send(body);
  const weekBody = (seatId: string, startDate = start()) => ({
    seatId,
    pass: 'week' as const,
    slot: 'day' as const,
    startDate,
  });
  const dayBody = (seatId: string, startDate = start()) => ({
    seatId,
    pass: 'day' as const,
    slot: 'day' as const,
    startDate,
  });
  const count = async (table: typeof booking | typeof seatHold) =>
    (await db.select({ n: sql<number>`count(*)::int` }).from(table))[0]?.n ?? -1;
  const problem = (res: { body: unknown }) =>
    res.body as { type: string; title: string; detail: string };
  const retries = (warn: { mock: { calls: unknown[][] } }) =>
    warn.mock.calls.filter((c) => c[1] === RETRY_LOG);

  beforeAll(async () => {
    app = await createTestApp();
    db = testDb(app);
    pool = app.get<pg.Pool>(PG_POOL);
  });
  beforeEach(async () => {
    await resetDb(app);
    ({ agent: owner, userId: ownerId } = await signedInUser(app, 'owner@example.com', 'Owner'));
    await db.update(user).set({ accountType: 'owner' }).where(eq(user.id, ownerId));
    ({ agent: renter, userId: renterId } = await signedInUser(app, 'r@example.com'));
    const s = await createListing(db, ownerId, {
      status: 'published',
      timeZone: ZONE,
      openingMode: 'always_open',
      shiftChangeAt: '07:00',
      opensAt: null,
      closesAt: null,
    });
    spaceId = s.id;
    [s0, s1, s2] = (await createSeats(db, spaceId, 3)).map((x) => x.id) as [string, string, string];
    await db.insert(availabilityCalendar).values({ spaceId, startDate: '2020-01-01' });
    await db.insert(passPrice).values([
      { spaceId, slot: 'day', pass: 'day', amount: '500.00' },
      { spaceId, slot: 'day', pass: 'week', amount: '2800.00' },
    ]);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  afterAll(() => app.close());

  it('prices a booking with a price that committed before its space lock', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT 1 FROM space WHERE id = $1 FOR UPDATE', [spaceId]);
      await client.query(
        `UPDATE pass_price SET amount = '777.00' WHERE space_id = $1 AND slot = 'day' AND pass = 'day'`,
        [spaceId],
      );
      // The booking blocks on the space share lock until the price change commits.
      const pending = post(renter, dayBody(s0)).then((r) => r);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await client.query('COMMIT');
      const res = await pending;
      expect(res.status).toBe(201);
      expect((res.body as { price: { amount: string } }).price.amount).toBe('777.00');
    } finally {
      client.release();
    }
  });

  it('201: a week pass with 7 days and a price snapshot, no user id, then taken', async () => {
    const res = await post(renter, weekBody(s0)).expect(201);
    const s = start();
    expect(res.body).toMatchObject({
      status: 'active',
      pass: 'week',
      slot: 'day',
      startDate: s,
      endDate: addDays(s, 6),
      timeZone: ZONE,
      slotTimes: { startTime: '07:00', endTime: '19:00', endsNextDay: false },
      skippedDates: [],
      price: { amount: '2800.00', currency: 'INR' },
      seat: { id: s0, label: 'S-01', cubicleName: null },
      space: { id: spaceId, area: 'Baner', city: 'Pune', country: 'IN' },
      cancelledAt: null,
    });
    expect((res.body as { days: unknown[] }).days).toHaveLength(7);
    expect(JSON.stringify(res.body)).not.toContain(renterId);

    const avail = await renter
      .get(`/api/listings/${spaceId}/seats?pass=week&slot=day&startDate=${s}`)
      .expect(200);
    const seats = (avail.body as { seats: { id: string; status: string }[] }).seats;
    expect(seats.find((x) => x.id === s0)?.status).toBe('taken');
    expect(seats.find((x) => x.id === s1)?.status).toBe('free');
    expect(await count(seatHold)).toBe(7);
    const holds = await db
      .select()
      .from(seatHold)
      .where(and(eq(seatHold.userId, renterId), eq(seatHold.seatId, s0)));
    expect(holds).toHaveLength(7);
  });

  it('holds only the open days of a pass that spans closed days', async () => {
    await db
      .update(availabilityCalendar)
      .set({ weekdays: 31 }) // Monday to Friday
      .where(eq(availabilityCalendar.spaceId, spaceId));
    let monday = localDateFromNow(1, ZONE);
    while (new Date(`${monday}T00:00:00Z`).getUTCDay() !== 1) monday = addDays(monday, 1);
    const res = await post(renter, weekBody(s0, monday)).expect(201);
    expect((res.body as { days: unknown[] }).days).toHaveLength(5);
    expect((res.body as { skippedDates: string[] }).skippedDates).toHaveLength(2);
    expect(await count(seatHold)).toBe(5);
  });

  it('400 on invalid input and 401 without a session; nothing is created', async () => {
    await post(renter, { ...dayBody(s0), seatId: 'nope' }).expect(400);
    await post(renter, { ...dayBody(s0), pass: 'year' }).expect(400);
    await post(renter, { ...dayBody(s0), userId: 'x' }).expect(400);
    await post(renter, { seatId: s0 }).expect(400);
    await post(renter, dayBody(s0), 'not-a-uuid').expect(400);
    await request(app.getHttpServer())
      .post(`/api/listings/${spaceId}/bookings`)
      .send(dayBody(s0))
      .expect(401);
    expect(await count(booking)).toBe(0);
  });

  it('404 with one body for unknown, draft, foreign and removed seats and spaces', async () => {
    const draft = await createListing(db, ownerId, { status: 'draft', timeZone: ZONE });
    const [draftSeat] = await createSeats(db, draft.id, 1);
    const other = await createListing(db, ownerId, { status: 'published', timeZone: ZONE });
    const [otherSeat] = await createSeats(db, other.id, 1);
    await db.update(seat).set({ removedAt: new Date() }).where(eq(seat.id, s2));
    const results = await Promise.all([
      post(renter, dayBody(s0), randomUUID()),
      post(renter, dayBody(draftSeat?.id ?? ''), draft.id),
      post(owner, dayBody(draftSeat?.id ?? ''), draft.id),
      post(renter, dayBody(otherSeat?.id ?? '')),
      post(renter, dayBody(s2)),
      post(renter, dayBody(randomUUID())),
    ]);
    const strip = (b: unknown) => {
      const { instance: _i, requestId: _r, ...rest } = b as Record<string, unknown>;
      return rest;
    };
    for (const r of results) {
      expect(r.status).toBe(404);
      expect(strip(r.body)).toEqual(strip(results[0].body));
    }
    expect(await count(booking)).toBe(0);
  });

  it('a draft id is 404 even for its owner with an unoffered pass and a past date', async () => {
    const draft = await createListing(db, ownerId, { status: 'draft', timeZone: ZONE });
    const [d] = await createSeats(db, draft.id, 1);
    await post(owner, weekBody(d?.id ?? '', localDateFromNow(-5, ZONE)), draft.id).expect(404);
  });

  describe('409 conflicts', () => {
    it('seat-unavailable when another renter holds any day of the period; nothing is created', async () => {
      const other = await signedInUser(app, 'other@example.com');
      await post(other.agent, dayBody(s0, addDays(start(), 2))).expect(201);
      const holdsBefore = await count(seatHold);
      const res = await post(renter, weekBody(s0)).expect(409);
      expect(problem(res)).toMatchObject({
        type: `${PREFIX}booking:seat-unavailable`,
        title: 'Seat unavailable',
        detail: 'This seat is no longer available for that period.',
      });
      expect(await count(booking)).toBe(1);
      expect(await count(seatHold)).toBe(holdsBefore);
    });

    it('seat-unavailable when an occupancy mark holds the seat', async () => {
      const day = addDays(start(), 1);
      const mark = await insertOccupancyMark(db, {
        seatId: s0,
        createdBy: ownerId,
        startDate: day,
        endDate: day,
      });
      await insertHold(db, {
        seatId: s0,
        occupancyMarkId: mark.id,
        startsAt: new Date(`${day}T00:00:00Z`),
        endsAt: new Date(`${addDays(day, 1)}T00:00:00Z`),
      });
      const res = await post(renter, weekBody(s0)).expect(409);
      expect(problem(res).type).toBe(`${PREFIX}booking:seat-unavailable`);
      expect(await count(booking)).toBe(0);
    });

    it('a day pass and a night pass on one seat do not overlap', async () => {
      await db.insert(passPrice).values({ spaceId, slot: 'night', pass: 'day', amount: '300.00' });
      await post(renter, dayBody(s0)).expect(201);
      const other = await signedInUser(app, 'night@example.com');
      await post(other.agent, { ...dayBody(s0), slot: 'night' }).expect(201);
    });

    it('user-overlap when the renter holds an overlapping pass at another space', async () => {
      const x = await createListing(db, ownerId, {
        status: 'published',
        timeZone: ZONE,
        openingMode: 'always_open',
        shiftChangeAt: '07:00',
      });
      const [xs] = await createSeats(db, x.id, 1);
      await db.insert(availabilityCalendar).values({ spaceId: x.id, startDate: '2020-01-01' });
      await db
        .insert(passPrice)
        .values({ spaceId: x.id, slot: 'day', pass: 'day', amount: '400.00' });
      await post(renter, dayBody(xs?.id ?? ''), x.id).expect(201);
      const res = await post(renter, dayBody(s0)).expect(409);
      expect(problem(res)).toMatchObject({
        type: `${PREFIX}booking:user-overlap`,
        title: 'Overlapping booking',
      });
      expect(await count(booking)).toBe(1);
    });
  });

  describe('422 rules create nothing', () => {
    const expectRule = async (res: Promise<{ status: number; body: unknown }>, rule: string) => {
      const r = await res;
      expect(r.status).toBe(422);
      expect(problem(r).type).toBe(`${PREFIX}booking-rule:${rule}`);
      expect(await count(booking)).toBe(0);
      expect(await count(seatHold)).toBe(0);
    };

    it('space-not-published', async () => {
      await db.update(space).set({ status: 'unpublished' }).where(eq(space.id, spaceId));
      await expectRule(post(renter, dayBody(s0)), 'space-not-published');
    });
    it('own-space', async () => {
      await expectRule(post(owner, dayBody(s0)), 'own-space');
    });
    it('pass-not-offered', async () => {
      await expectRule(post(renter, { ...dayBody(s0), pass: 'month' }), 'pass-not-offered');
      await expectRule(post(renter, { ...dayBody(s0), slot: 'working_hours' }), 'pass-not-offered');
    });
    it('start-day-closed, also without a shared calendar', async () => {
      const bit = 1 << ((new Date(`${start()}T00:00:00Z`).getUTCDay() + 6) % 7);
      await db
        .update(availabilityCalendar)
        .set({ weekdays: 127 & ~bit })
        .where(eq(availabilityCalendar.spaceId, spaceId));
      await expectRule(post(renter, dayBody(s0)), 'start-day-closed');
      await db.delete(availabilityCalendar).where(eq(availabilityCalendar.spaceId, spaceId));
      await expectRule(post(renter, dayBody(s0)), 'start-day-closed');
    });
    it('slot-started', async () => {
      await expectRule(post(renter, dayBody(s0, localDateFromNow(-1, ZONE))), 'slot-started');
    });
    it('too-far-ahead', async () => {
      await expectRule(post(renter, dayBody(s0, localDateFromNow(32, ZONE))), 'too-far-ahead');
    });
  });

  describe('invariants held in the database', () => {
    it('an unpublish committing between the rule check and the insert is refused', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`UPDATE space SET status = 'unpublished' WHERE id = $1`, [spaceId]);
        const pending = post(renter, dayBody(s0)).then((r) => r);
        await new Promise((r) => setTimeout(r, 500));
        await client.query('COMMIT');
        const res = await pending;
        expect(res.status).toBe(422);
        expect(problem(res).type).toBe(`${PREFIX}booking-rule:space-not-published`);
      } finally {
        client.release();
      }
      expect(await count(booking)).toBe(0);
    });

    it('a seat removed between the check and the insert is a 404', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(`UPDATE seat SET removed_at = now() WHERE id = $1`, [s0]);
        const pending = post(renter, dayBody(s0)).then((r) => r);
        await new Promise((r) => setTimeout(r, 500));
        await client.query('COMMIT');
        expect((await pending).status).toBe(404);
      } finally {
        client.release();
      }
      expect(await count(booking)).toBe(0);
    });

    it('a pass header with no holds blocks nothing', async () => {
      await db.insert(booking).values({
        seatId: s0,
        userId: renterId,
        spaceId,
        kind: 'pass',
        pass: 'day',
        slot: 'day',
        startDate: start(),
        endDate: start(),
        price: '1.00',
        currency: 'INR',
        startsAt: new Date(`${start()}T01:00:00Z`),
        endsAt: new Date(`${start()}T13:00:00Z`),
      });
      const other = await signedInUser(app, 'free@example.com');
      await post(other.agent, dayBody(s0)).expect(201);
    });

    it('the database does not tie a header envelope to its holds (accepted residual risk)', async () => {
      const res = await post(renter, dayBody(s0)).expect(201);
      const id = (res.body as { id: string }).id;
      await db
        .update(booking)
        .set({
          startsAt: new Date('2031-01-01T00:00:00Z'),
          endsAt: new Date('2031-01-02T00:00:00Z'),
        })
        .where(eq(booking.id, id));
      const [h] = await db.select().from(booking).where(eq(booking.id, id));
      expect(h?.startsAt.toISOString()).toBe('2031-01-01T00:00:00.000Z');
    });

    it('fails within about 5 s with a 500 and no rows while another connection holds the seat lock', async () => {
      const client = await pool.connect();
      const warn = vi.spyOn(PinoLogger.prototype, 'warn');
      try {
        await client.query('BEGIN');
        await client.query(`select pg_advisory_xact_lock($1::int, hashtext($2::text))`, [
          SEAT_HOLD_LOCK_CLASS,
          s0,
        ]);
        const started = Date.now();
        const res = await post(renter, dayBody(s0));
        const took = Date.now() - started;
        expect(res.status).toBe(500);
        expect(took).toBeGreaterThanOrEqual(4000);
        expect(took).toBeLessThan(9000);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ seatId: s0 }),
        'booking.lock_timeout',
      );
      expect(retries(warn)).toHaveLength(0);
      expect(await count(booking)).toBe(0);
      expect(await count(seatHold)).toBe(0);
    }, 20_000);

    it('seat removal racing a booking never leaves a removed seat with a live booking', async () => {
      for (let round = 0; round < 8; round += 1) {
        await db.delete(booking);
        await db.update(seat).set({ removedAt: null }).where(eq(seat.id, s0));
        const [del, book] = await Promise.all([
          owner.delete(`/api/owner/spaces/${spaceId}/seats/${s0}`),
          post(renter, dayBody(s0)),
        ]);
        const [row] = await db
          .select({ removedAt: seat.removedAt })
          .from(seat)
          .where(eq(seat.id, s0));
        if (book.status === 201) {
          expect(del.status).toBe(409);
          expect(row?.removedAt).toBeNull();
          expect(await count(booking)).toBe(1);
        } else {
          expect(book.status).toBe(404);
          expect(del.status).toBe(204);
          expect(row?.removedAt).not.toBeNull();
          expect(await count(booking)).toBe(0);
        }
      }
    }, 60_000);
  });

  describe('emails (T037)', () => {
    async function ownerWithSeat(email: string) {
      const o = await signedInUser(app, email, 'Olive Owner');
      await db.update(user).set({ accountType: 'owner' }).where(eq(user.id, o.userId));
      const s = await createListing(db, o.userId, {
        status: 'published',
        timeZone: ZONE,
        openingMode: 'always_open',
        shiftChangeAt: '07:00',
        opensAt: null,
        closesAt: null,
      });
      const [seatRow] = await createSeats(db, s.id, 1);
      if (!seatRow) throw new Error('no seat');
      await db.insert(availabilityCalendar).values({ spaceId: s.id, startDate: '2020-01-01' });
      await db
        .insert(passPrice)
        .values({ spaceId: s.id, slot: 'day', pass: 'day', amount: '500.00' });
      return { spaceId: s.id, seatId: seatRow.id };
    }

    it('a booking sends one email to the renter and one to the owner, no renter address to the owner', async () => {
      const tag = randomUUID().slice(0, 8);
      const ownerEmail = `own-${tag}@example.com`;
      const renterEmail = `ren-${tag}@example.com`;
      const o = await ownerWithSeat(ownerEmail);
      const r = await signedInUser(app, renterEmail, 'Rita Renter');
      await post(r.agent, dayBody(o.seatId), o.spaceId).expect(201);

      const [renterMail] = await waitForMail(renterEmail, 'Booking confirmed:');
      const [ownerMail] = await waitForMail(ownerEmail, 'New booking at');
      expect(renterMail?.text).toContain('Payment is made directly to the owner.');
      expect(renterMail?.text).toContain('500.00 INR');
      expect(renterMail?.text).toContain(`(${ZONE})`);
      expect(ownerMail?.text).toContain('Rita Renter');
      expect(ownerMail?.text).not.toContain(renterEmail);
    }, 90_000);

    it('a race for one seat mails only the winner and the owner once', async () => {
      const tag = randomUUID().slice(0, 8);
      const ownerEmail = `own-${tag}@example.com`;
      const o = await ownerWithSeat(ownerEmail);
      const emails = Array.from({ length: 5 }, (_, i) => `race${i}-${tag}@example.com`);
      const racers = await Promise.all(emails.map((e) => signedInUser(app, e)));
      const results = await Promise.all(
        racers.map((x) => post(x.agent, dayBody(o.seatId), o.spaceId)),
      );
      const winners = results.flatMap((res, i) => (res.status === 201 ? [i] : []));
      expect(winners).toHaveLength(1);

      const winnerEmail = emails[winners[0] ?? 0] ?? '';
      expect(await waitForMail(winnerEmail, 'Booking confirmed:')).toHaveLength(1);
      expect(await waitForMail(ownerEmail, 'New booking at')).toHaveLength(1);
      for (const loser of emails.filter((e) => e !== winnerEmail)) {
        await expect(waitForMail(loser, 'Booking confirmed:', 1_000)).rejects.toThrow(/No mail/);
      }
    }, 90_000);
  });

  describe('races', () => {
    it('20 renters, mixed day and week passes: one 201 and nineteen 409, 5 rounds, no deadlock retry', async () => {
      const warn = vi.spyOn(PinoLogger.prototype, 'warn');
      const racers: Agent[] = [];
      for (let i = 0; i < 20; i += 1) {
        racers.push((await signedInUser(app, `racer${i}@example.com`)).agent);
      }
      for (let round = 0; round < 5; round += 1) {
        await db.delete(booking);
        const results = await Promise.all(
          racers.map((agent, i) =>
            i % 2 === 0
              ? post(agent, weekBody(s0, addDays(start(), i % 4 === 0 ? 0 : 1)))
              : post(agent, dayBody(s0, addDays(start(), 3))),
          ),
        );
        const statuses = results.map((r) => r.status);
        expect(statuses.filter((s) => s === 201)).toHaveLength(1);
        expect(statuses.filter((s) => s === 409)).toHaveLength(19);
        for (const r of results.filter((x) => x.status === 409)) {
          expect(problem(r).type).toBe(`${PREFIX}booking:seat-unavailable`);
        }
        expect(await count(booking)).toBe(1);
      }
      expect(retries(warn)).toHaveLength(0);
    }, 120_000);

    it('60 callers for one seat (service level): one success, 59 unavailable, one transaction each', async () => {
      const ids: string[] = [];
      for (let i = 0; i < 60; i += 1) {
        const id = `svc-${i}-${randomUUID()}`;
        await db.insert(user).values({ id, name: `U${i}`, email: `${id}@example.com` });
        ids.push(id);
      }
      const service = app.get(BookingsService);
      const tx = vi.spyOn(db, 'transaction');
      const warn = vi.spyOn(PinoLogger.prototype, 'warn');
      const results = await Promise.allSettled(
        ids.map((id) => service.create(id, spaceId, weekBody(s0))),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const rejected = results.filter((r) => r.status === 'rejected');
      expect(rejected).toHaveLength(59);
      for (const r of rejected) {
        expect(r.reason).toMatchObject({ type: `${PREFIX}booking:seat-unavailable` });
      }
      expect(tx).toHaveBeenCalledTimes(60);
      expect(retries(warn)).toHaveLength(0);
    }, 60_000);

    it('different seats do not block each other', async () => {
      const others = await Promise.all([1, 2].map((i) => signedInUser(app, `par${i}@example.com`)));
      const agents = [renter, ...others.map((o) => o.agent)];
      const seats = [s0, s1, s2];
      const results = await Promise.all(agents.map((a, i) => post(a, weekBody(seats[i] ?? ''))));
      expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    });
  });
});
