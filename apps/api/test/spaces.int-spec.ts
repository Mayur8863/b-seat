import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seat } from '../src/db/schema/index.js';
import { toInstant, toLocal } from '../src/common/time/zoned-time.js';
import { SpaceAvailabilitySchema } from '../src/spaces/spaces.schemas.js';
import { createSeats, createSpace, insertBooking, testDb } from './fixtures.js';
import { createTestApp, resetDb, signedInAgent } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The UTC instant of a local wall-clock time; fails the test on a DST gap or overlap. */
function at(date: string, time: string, timeZone: string): Date {
  const result = toInstant(date, time, timeZone);
  if (result.kind !== 'ok') throw new Error(`${date} ${time} is ${result.kind} in ${timeZone}`);
  return result.instant;
}

function tomorrow(timeZone: string): string {
  return toLocal(new Date(Date.now() + DAY_MS), timeZone).date;
}

describe('spaces API', () => {
  let app: NestExpressApplication;
  let agent: Agent;
  let userId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(app);
    agent = await signedInAgent(app);
    const me = await agent.get('/api/me').expect(200);
    userId = (me.body as { id: string }).id;
  });
  afterAll(() => app.close());

  describe('GET /api/spaces', () => {
    it('lists every space ordered by name with its seat count (AC 1.1, FR-002)', async () => {
      const db = testDb(app);
      const pune = await createSpace(db, {
        name: 'Pune Hub',
        location: 'Pune, India',
        timeZone: 'Asia/Kolkata',
      });
      const london = await createSpace(db, {
        name: 'London HQ',
        location: 'London, United Kingdom',
        timeZone: 'Europe/London',
      });
      const empty = await createSpace(db, { name: 'Zurich Annex', timeZone: 'Europe/Zurich' });
      await createSeats(db, pune.id, 8);
      await createSeats(db, london.id, 12);

      const res = await agent.get('/api/spaces').expect(200);

      expect(res.body).toEqual({
        items: [
          {
            id: london.id,
            name: 'London HQ',
            location: 'London, United Kingdom',
            timeZone: 'Europe/London',
            seatCount: 12,
          },
          {
            id: pune.id,
            name: 'Pune Hub',
            location: 'Pune, India',
            timeZone: 'Asia/Kolkata',
            seatCount: 8,
          },
          {
            id: empty.id,
            name: 'Zurich Annex',
            location: 'Test City',
            timeZone: 'Europe/Zurich',
            seatCount: 0,
          },
        ],
      });
    });

    it('returns an empty list when there are no spaces', async () => {
      const res = await agent.get('/api/spaces').expect(200);
      expect(res.body).toEqual({ items: [] });
    });

    it('is 401 problem+json without a session (AC 1.4, FR-001)', async () => {
      const res = await request(app.getHttpServer()).get('/api/spaces').expect(401);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toMatchObject({ type: 'urn:bseat:problem:http-401', status: 401 });
    });
  });

  describe('soft-removed seats (R-15)', () => {
    it('are excluded from the seat count and the availability list, and the space still lists', async () => {
      const db = testDb(app);
      const sp = await createSpace(db, { name: 'London HQ', timeZone: 'Europe/London' });
      const bare = await createSpace(db, { name: 'Bare Annex', timeZone: 'Europe/London' });
      const seats = await createSeats(db, sp.id, 3);
      const [gone] = await createSeats(db, bare.id, 1);
      if (!seats[1] || !gone) throw new Error('expected seats');
      await db.update(seat).set({ removedAt: new Date() }).where(eq(seat.id, seats[1].id));
      await db.update(seat).set({ removedAt: new Date() }).where(eq(seat.id, gone.id));

      const list = await agent.get('/api/spaces').expect(200);
      const counts = Object.fromEntries(
        (list.body as { items: { name: string; seatCount: number }[] }).items.map((i) => [
          i.name,
          i.seatCount,
        ]),
      );
      expect(counts).toEqual({ 'London HQ': 2, 'Bare Annex': 0 });

      const res = await agent
        .get(`/api/spaces/${sp.id}/availability`)
        .query({ date: tomorrow('Europe/London'), startTime: '09:00', endTime: '10:00' })
        .expect(200);
      expect(SpaceAvailabilitySchema.parse(res.body).seats.map((x) => x.label)).toEqual([
        'S-01',
        'S-03',
      ]);
    });
  });

  describe('GET /api/spaces/:spaceId/availability', () => {
    const TZ = 'Europe/London';

    async function londonWithBooking(status: 'active' | 'cancelled' = 'active') {
      const db = testDb(app);
      const space = await createSpace(db, {
        name: 'London HQ',
        location: 'London, United Kingdom',
        timeZone: TZ,
      });
      const seats = await createSeats(db, space.id, 6);
      const date = tomorrow(TZ);
      const booked = seats[2];
      if (!booked) throw new Error('expected 6 seats');
      await insertBooking(db, {
        seatId: booked.id,
        userId,
        startsAt: at(date, '09:00', TZ),
        endsAt: at(date, '12:00', TZ),
        status,
      });
      return { space, seats, booked, date };
    }

    const statusByLabel = (body: unknown) =>
      Object.fromEntries(SpaceAvailabilitySchema.parse(body).seats.map((s) => [s.label, s.status]));

    it('marks the seat with an overlapping active booking as taken (AC 1.2, FR-003)', async () => {
      const { space, seats, booked, date } = await londonWithBooking();

      const res = await agent
        .get(`/api/spaces/${space.id}/availability`)
        .query({ date, startTime: '10:00', endTime: '11:00' })
        .expect(200);

      expect(res.body).toEqual({
        space: {
          id: space.id,
          name: 'London HQ',
          location: 'London, United Kingdom',
          timeZone: TZ,
        },
        window: {
          date,
          startTime: '10:00',
          endTime: '11:00',
          startsAt: at(date, '10:00', TZ).toISOString(),
          endsAt: at(date, '11:00', TZ).toISOString(),
        },
        seats: seats.map((s) => ({
          id: s.id,
          label: s.label,
          features: [],
          status: s.id === booked.id ? 'taken' : 'free',
        })),
      });
      expect(Object.values(statusByLabel(res.body)).filter((s) => s === 'free')).toHaveLength(5);
    });

    it('treats a window touching the booking end as free (AC 1.3)', async () => {
      const { space, date } = await londonWithBooking();

      const res = await agent
        .get(`/api/spaces/${space.id}/availability`)
        .query({ date, startTime: '12:00', endTime: '13:00' })
        .expect(200);

      expect(res.body.seats).toHaveLength(6);
      expect(new Set(Object.values(statusByLabel(res.body)))).toEqual(new Set(['free']));
    });

    it('ignores cancelled bookings (FR-010)', async () => {
      const { space, date } = await londonWithBooking('cancelled');

      const res = await agent
        .get(`/api/spaces/${space.id}/availability`)
        .query({ date, startTime: '10:00', endTime: '11:00' })
        .expect(200);

      expect(new Set(Object.values(statusByLabel(res.body)))).toEqual(new Set(['free']));
    });

    it('evaluates the window in the space time zone (edge "time zones")', async () => {
      const db = testDb(app);
      const kolkata = 'Asia/Kolkata';
      const space = await createSpace(db, { name: 'Pune Hub', timeZone: kolkata });
      const [seat] = await createSeats(db, space.id, 2);
      if (!seat) throw new Error('expected seats');
      const date = tomorrow(kolkata);
      await insertBooking(db, {
        seatId: seat.id,
        userId,
        startsAt: at(date, '09:00', kolkata),
        endsAt: at(date, '10:00', kolkata),
      });

      const res = await agent
        .get(`/api/spaces/${space.id}/availability`)
        .query({ date, startTime: '09:30', endTime: '10:30' })
        .expect(200);

      expect(res.body.window).toMatchObject({
        startsAt: `${date}T04:00:00.000Z`,
        endsAt: `${date}T05:00:00.000Z`,
      });
      expect(statusByLabel(res.body)).toEqual({ 'S-01': 'taken', 'S-02': 'free' });
    });

    it('lets a rule-breaking window be viewed (edge "rule-breaking windows")', async () => {
      const db = testDb(app);
      const space = await createSpace(db, { timeZone: TZ });
      await createSeats(db, space.id, 1);

      const res = await agent
        .get(`/api/spaces/${space.id}/availability`)
        .query({ date: '2020-01-01', startTime: '05:10', endTime: '23:50' })
        .expect(200);

      expect(res.body.seats).toEqual([expect.objectContaining({ status: 'free' })]);
    });

    it('returns seat features and never identifies who booked (FR-011)', async () => {
      const { space, date } = await londonWithBooking();

      const res = await agent
        .get(`/api/spaces/${space.id}/availability`)
        .query({ date, startTime: '09:00', endTime: '12:00' })
        .expect(200);

      const raw = JSON.stringify(res.body);
      expect(raw).not.toContain(userId);
      expect(raw).not.toContain('Test User');
      expect(raw).not.toContain('test@example.com');
      for (const seat of res.body.seats as Record<string, unknown>[]) {
        expect(Object.keys(seat).sort()).toEqual(['features', 'id', 'label', 'status']);
      }
    });

    it('is 404 for an unknown space (edge "not found")', async () => {
      const res = await agent
        .get('/api/spaces/00000000-0000-4000-8000-000000000000/availability')
        .query({ date: '2026-10-23', startTime: '10:00', endTime: '11:00' })
        .expect(404);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toMatchObject({ type: 'urn:bseat:problem:http-404', status: 404 });
    });

    it.each([
      [
        'endTime equal to startTime',
        'valid',
        { date: '2026-10-23', startTime: '10:00', endTime: '10:00' },
      ],
      [
        'endTime before startTime',
        'valid',
        { date: '2026-10-23', startTime: '11:00', endTime: '10:00' },
      ],
      ['a malformed date', 'valid', { date: '23/10/2026', startTime: '10:00', endTime: '11:00' }],
      ['a malformed time', 'valid', { date: '2026-10-23', startTime: '10am', endTime: '11:00' }],
      ['a missing query', 'valid', {}],
      [
        'a malformed space id',
        'not-a-uuid',
        { date: '2026-10-23', startTime: '10:00', endTime: '11:00' },
      ],
    ])('is 400 validation for %s', async (_, id, query) => {
      const db = testDb(app);
      const space = await createSpace(db);
      const spaceId = id === 'valid' ? space.id : id;

      const res = await agent.get(`/api/spaces/${spaceId}/availability`).query(query).expect(400);

      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toMatchObject({ type: 'urn:bseat:problem:validation', status: 400 });
      expect(res.body.errors.length).toBeGreaterThan(0);
    });

    it('is 422 invalid-local-time when the window ends in a DST gap (edge DST)', async () => {
      const db = testDb(app);
      const space = await createSpace(db, { name: 'London HQ', timeZone: TZ });

      const res = await agent
        .get(`/api/spaces/${space.id}/availability`)
        .query({ date: '2026-03-29', startTime: '00:30', endTime: '01:30' })
        .expect(422);

      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toMatchObject({
        type: 'urn:bseat:problem:booking-rule:invalid-local-time',
        title: 'Invalid booking window',
        status: 422,
      });
    });

    it('is 401 problem+json without a session (AC 1.4, FR-001)', async () => {
      const db = testDb(app);
      const space = await createSpace(db);

      const res = await request(app.getHttpServer())
        .get(`/api/spaces/${space.id}/availability`)
        .query({ date: '2026-10-23', startTime: '10:00', endTime: '11:00' })
        .expect(401);

      expect(res.headers['content-type']).toContain('application/problem+json');
    });
  });
});
