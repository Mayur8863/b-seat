import { randomUUID } from 'node:crypto';

import { getQueueToken } from '@nestjs/bullmq';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { type BookingRule, ruleViolation } from '../src/bookings/booking-rules.js';
import { BookingSchema } from '../src/bookings/bookings.schemas.js';
import type { Database } from '../src/db/db.js';
import { booking } from '../src/db/schema/index.js';
import { MailService } from '../src/mail/mail.service.js';
import { MAIL_QUEUE } from '../src/mail/mail.types.js';
import {
  createSeats,
  createSpace,
  insertBooking,
  localDateFromNow,
  localInstant,
  type SeatRow,
  signedInUser,
  type SpaceRow,
  testDb,
  waitForMail,
} from './fixtures.js';
import { createTestApp, resetDb } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signedInUser>>['agent'];

const TZ = 'Europe/London';
const SEAT_UNAVAILABLE = 'urn:bseat:problem:booking:seat-unavailable';
const USER_OVERLAP = 'urn:bseat:problem:booking:user-overlap';

/** A queue that never answers, as when Redis is down. */
function neverSettles(): void {
  return undefined;
}

describe('POST /api/bookings', () => {
  let app: NestExpressApplication;
  let db: Database;
  let agent: Agent;
  let userId: string;
  let london: SpaceRow;
  let seats: SeatRow[];
  let tomorrow: string;

  const seatAt = (i: number): SeatRow => {
    const s = seats[i];
    if (!s) throw new Error(`no seat ${i}`);
    return s;
  };
  const bookingsOf = (uid: string) => db.select().from(booking).where(eq(booking.userId, uid));

  beforeAll(async () => {
    app = await createTestApp();
    // Listen once, so concurrent supertest requests share one server instead of each
    // starting (and closing) an ephemeral one.
    await app.listen(0, '127.0.0.1');
    db = testDb(app);
  });
  beforeEach(async () => {
    await resetDb(app);
    ({ agent, userId } = await signedInUser(app, 'booker@example.com'));
    london = await createSpace(db, {
      name: 'London HQ',
      location: 'London, United Kingdom',
      timeZone: TZ,
    });
    seats = await createSeats(db, london.id, 6);
    tomorrow = localDateFromNow(1, TZ);
  });
  afterAll(() => app.close());

  it('books a free seat and returns local and UTC times (AC 2.1, FR-004)', async () => {
    const seat = seatAt(2);

    const res = await agent
      .post('/api/bookings')
      .send({ seatId: seat.id, date: tomorrow, startTime: '09:00', endTime: '12:00' })
      .expect(201);

    expect(res.body).toEqual({
      id: expect.any(String),
      status: 'active',
      date: tomorrow,
      startTime: '09:00',
      endTime: '12:00',
      timeZone: TZ,
      startsAt: localInstant(tomorrow, '09:00', TZ).toISOString(),
      endsAt: localInstant(tomorrow, '12:00', TZ).toISOString(),
      seat: { id: seat.id, label: seat.label },
      space: { id: london.id, name: 'London HQ', location: 'London, United Kingdom' },
      createdAt: expect.any(String),
      cancelledAt: null,
    });
    expect(BookingSchema.safeParse(res.body).success).toBe(true);

    const [row] = await bookingsOf(userId);
    expect(row).toMatchObject({ id: res.body.id, seatId: seat.id, status: 'active' });

    const availability = await agent
      .get(`/api/spaces/${london.id}/availability`)
      .query({ date: tomorrow, startTime: '10:00', endTime: '11:00' })
      .expect(200);
    const status = Object.fromEntries(
      (availability.body.seats as { id: string; status: string }[]).map((s) => [s.id, s.status]),
    );
    expect(status[seat.id]).toBe('taken');
  });

  it('never returns the user id (FR-011)', async () => {
    const res = await agent
      .post('/api/bookings')
      .send({ seatId: seatAt(0).id, date: tomorrow, startTime: '09:00', endTime: '10:00' })
      .expect(201);

    expect(JSON.stringify(res.body)).not.toContain(userId);
    expect(Object.keys(res.body as object)).not.toContain('userId');
  });

  it('is 409 seat-unavailable when another user holds the seat (AC 2.3, FR-005)', async () => {
    const other = await signedInUser(app, 'other@example.com');
    await insertBooking(db, {
      seatId: seatAt(0).id,
      userId: other.userId,
      startsAt: localInstant(tomorrow, '09:00', TZ),
      endsAt: localInstant(tomorrow, '12:00', TZ),
    });

    const res = await agent
      .post('/api/bookings')
      .send({ seatId: seatAt(0).id, date: tomorrow, startTime: '10:00', endTime: '11:00' })
      .expect(409);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({
      type: SEAT_UNAVAILABLE,
      title: 'Seat unavailable',
      status: 409,
      detail: 'This seat is no longer available for that time.',
      instance: '/api/bookings',
    });
    expect(await bookingsOf(userId)).toEqual([]);
  });

  it('is 409 user-overlap when I already hold an overlapping booking (AC 2.5, FR-006)', async () => {
    await agent
      .post('/api/bookings')
      .send({ seatId: seatAt(0).id, date: tomorrow, startTime: '09:00', endTime: '12:00' })
      .expect(201);

    const res = await agent
      .post('/api/bookings')
      .send({ seatId: seatAt(1).id, date: tomorrow, startTime: '11:00', endTime: '13:00' })
      .expect(409);

    expect(res.body).toMatchObject({
      type: USER_OVERLAP,
      title: 'Overlapping booking',
      status: 409,
      detail: 'You already have a booking at that time.',
    });
    expect(await bookingsOf(userId)).toHaveLength(1);
  });

  it('allows a booking that touches my previous one on the same seat (edge "touching windows")', async () => {
    await agent
      .post('/api/bookings')
      .send({ seatId: seatAt(0).id, date: tomorrow, startTime: '09:00', endTime: '12:00' })
      .expect(201);

    await agent
      .post('/api/bookings')
      .send({ seatId: seatAt(0).id, date: tomorrow, startTime: '12:00', endTime: '13:00' })
      .expect(201);

    expect(await bookingsOf(userId)).toHaveLength(2);
  });

  describe('booking rules (AC 2.6, FR-007)', () => {
    const cases: [BookingRule, () => { date: string; startTime: string; endTime: string }][] = [
      ['end-before-start', () => ({ date: tomorrow, startTime: '10:00', endTime: '09:00' })],
      ['not-on-quarter-hour', () => ({ date: tomorrow, startTime: '09:10', endTime: '10:00' })],
      // London's spring-forward gap; the rule order puts it before the time rules.
      ['invalid-local-time', () => ({ date: '2026-03-29', startTime: '01:30', endTime: '03:00' })],
      ['too-short', () => ({ date: tomorrow, startTime: '09:00', endTime: '09:00' })],
      ['too-long', () => ({ date: tomorrow, startTime: '08:00', endTime: '18:15' })],
      ['outside-working-hours', () => ({ date: tomorrow, startTime: '06:45', endTime: '08:00' })],
      [
        'starts-in-past',
        () => ({ date: localDateFromNow(-1, TZ), startTime: '09:00', endTime: '10:00' }),
      ],
      [
        'too-far-ahead',
        () => ({ date: localDateFromNow(31, TZ), startTime: '09:00', endTime: '10:00' }),
      ],
    ];

    it.each(cases)('is 422 %s with a detail naming the rule', async (rule, window) => {
      const res = await agent
        .post('/api/bookings')
        .send({ seatId: seatAt(0).id, ...window() })
        .expect(422);

      const expected = ruleViolation(rule, TZ);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toMatchObject({
        type: `urn:bseat:problem:booking-rule:${rule}`,
        title: 'Invalid booking window',
        status: 422,
        detail: expected.detail,
      });
      expect(await bookingsOf(userId)).toEqual([]);
    });
  });

  it('is 404 for an unknown seat (edge "not found")', async () => {
    const res = await agent
      .post('/api/bookings')
      .send({
        seatId: '00000000-0000-4000-8000-000000000000',
        date: tomorrow,
        startTime: '09:00',
        endTime: '10:00',
      })
      .expect(404);

    expect(res.body).toMatchObject({
      type: 'urn:bseat:problem:http-404',
      status: 404,
      detail: 'Seat not found',
    });
    expect(await bookingsOf(userId)).toEqual([]);
  });

  it.each([
    ['a malformed seat id', { seatId: 'seat-1' }],
    ['a malformed date', { date: '23/10/2026' }],
    ['an impossible date', { date: '2026-02-30' }],
    ['a malformed time', { startTime: '9am' }],
    ['24:00', { endTime: '24:00' }],
    ['a missing field', { endTime: undefined }],
  ])('is 400 validation for %s', async (_, override) => {
    const body = {
      seatId: seatAt(0).id,
      date: tomorrow,
      startTime: '09:00',
      endTime: '10:00',
      ...override,
    };

    const res = await agent.post('/api/bookings').send(body).expect(400);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ type: 'urn:bseat:problem:validation', status: 400 });
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(await bookingsOf(userId)).toEqual([]);
  });

  it('is 401 problem+json without a session (FR-001)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/bookings')
      .send({ seatId: seatAt(0).id, date: tomorrow, startTime: '09:00', endTime: '10:00' })
      .expect(401);

    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ type: 'urn:bseat:problem:http-401', status: 401 });
  });

  it('lets exactly one of 20 concurrent requests book a seat, 5 times over (AC 2.4, SC-002)', async () => {
    const users = await Promise.all(
      Array.from({ length: 20 }, (_, i) => signedInUser(app, `racer-${i}@example.com`)),
    );

    for (let round = 0; round < 5; round += 1) {
      // A new seat and a non-overlapping window per round, so earlier winners hit no user overlap.
      const seat = seatAt(round);
      const startTime = `${String(8 + round * 2).padStart(2, '0')}:00`;
      const endTime = `${String(9 + round * 2).padStart(2, '0')}:00`;

      const responses = await Promise.all(
        users.map(({ agent: a }) =>
          a.post('/api/bookings').send({ seatId: seat.id, date: tomorrow, startTime, endTime }),
        ),
      );

      const statuses = responses.map((r) => r.status).sort();
      expect(statuses).toEqual([201, ...Array<number>(19).fill(409)]);
      for (const r of responses.filter((x) => x.status === 409)) {
        expect(r.body.type).toBe(SEAT_UNAVAILABLE);
      }
      const active = await db
        .select()
        .from(booking)
        .where(and(eq(booking.seatId, seat.id), eq(booking.status, 'active')));
      expect(active).toHaveLength(1);
    }
  }, 60_000);
  describe('confirmation email (T010, FR-008)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const window = () => ({ date: tomorrow, startTime: '09:00', endTime: '12:00' });

    it('reaches Mailpit with the booking in the space local time (AC 2.2, SC-004)', async () => {
      const email = `confirm-${randomUUID()}@example.com`;
      const { agent: booker } = await signedInUser(app, email, 'Grace Hopper');
      const seat = seatAt(0);

      await booker
        .post('/api/bookings')
        .send({ seatId: seat.id, ...window() })
        .expect(201);

      const mails = await waitForMail(email, 'Seat ');
      expect(mails).toHaveLength(1);
      const [mail] = mails;
      expect(mail?.subject).toBe(`Seat ${seat.label} booked at London HQ on ${tomorrow}`);
      expect(mail?.text).toContain('Hi Grace Hopper,');
      expect(mail?.text).toContain('London HQ (London, United Kingdom)');
      expect(mail?.text).toContain(`Seat:   ${seat.label}`);
      expect(mail?.text).toContain(`${tomorrow}, 09:00–12:00 (Europe/London)`);
    }, 70_000);

    it('keeps one queued job per booking when the confirmation is enqueued twice', async () => {
      const res = await agent
        .post('/api/bookings')
        .send({ seatId: seatAt(1).id, ...window() })
        .expect(201);
      const jobId = `booking-confirmed-${res.body.id as string}`;

      await app
        .get(MailService)
        .send({ to: 'booker@example.com', subject: 'duplicate', text: 'duplicate' }, { jobId });

      const queue = app.get<Queue>(getQueueToken(MAIL_QUEUE));
      const jobs = await queue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed']);
      const sameId = jobs.filter((j) => j.id === jobId);
      expect(sameId).toHaveLength(1);
      expect(sameId[0]?.data.subject).toMatch(/^Seat S-02 booked at London HQ/);
    });

    it('still books within the 2 s bound when the queue never answers (Redis down)', async () => {
      vi.spyOn(app.get(MailService), 'send').mockImplementation(
        () => new Promise<void>(neverSettles),
      );

      const started = Date.now();
      const res = await agent
        .post('/api/bookings')
        .send({ seatId: seatAt(2).id, ...window() })
        .expect(201);
      const elapsed = Date.now() - started;

      expect(elapsed).toBeGreaterThanOrEqual(1_900);
      expect(elapsed).toBeLessThan(4_000);
      const [row] = await bookingsOf(userId);
      expect(row).toMatchObject({ id: res.body.id, status: 'active' });
    });

    it('still books when enqueueing fails', async () => {
      vi.spyOn(app.get(MailService), 'send').mockRejectedValue(new Error('queue unavailable'));

      const res = await agent
        .post('/api/bookings')
        .send({ seatId: seatAt(3).id, ...window() })
        .expect(201);

      const [row] = await bookingsOf(userId);
      expect(row).toMatchObject({ id: res.body.id, status: 'active' });
    });
  });
});
