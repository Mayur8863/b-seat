import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { withSeatLock } from '../src/bookings/seat-lock.js';
import { booking } from '../src/db/schema/index.js';
import {
  createPublishedSpace,
  createSeats,
  localDateFromNow,
  localInstant,
  signedInUser,
  testDb,
} from './fixtures.js';
import { createTestApp, resetDb } from './helpers.js';

const TZ = 'Europe/London';

describe('retired hourly create (T008, R-7)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  it('POST /api/bookings is 404, signed in or not (the route no longer exists)', async () => {
    const { agent } = await signedInUser(app, 'booker@example.com');
    const body = {
      seatId: '00000000-0000-4000-8000-000000000000',
      date: '2026-10-23',
      startTime: '09:00',
      endTime: '10:00',
    };

    const signedIn = await agent.post('/api/bookings').send(body).expect(404);
    const anonymous = await request(app.getHttpServer()).post('/api/bookings').send(body);

    expect(signedIn.body).toMatchObject({ type: 'urn:bseat:problem:http-404', status: 404 });
    expect(anonymous.status).toBe(404);
  });
});

/** The advisory lock and retry logic that T005 and T036 reuse, proven against real Postgres. */
describe('withSeatLock against Postgres', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  it('lets exactly one of 20 racers for one seat win, and the rest get the 409, never a 5xx', async () => {
    const db = testDb(app);
    const racers = await Promise.all(
      Array.from({ length: 20 }, (_, i) => signedInUser(app, `racer${i}@example.com`)),
    );
    const space = await createPublishedSpace(db, { timeZone: TZ });
    const [seat] = await createSeats(db, space.id, 1);
    if (!seat) throw new Error('expected a seat');
    const date = localDateFromNow(1, TZ);
    const window = {
      seatId: seat.id,
      startsAt: localInstant(date, '09:00', TZ),
      endsAt: localInstant(date, '10:00', TZ),
    };
    const transaction = vi.spyOn(db, 'transaction');

    const results = await Promise.allSettled(
      racers.map(({ userId }) =>
        withSeatLock(db, seat.id, (tx) => tx.insert(booking).values({ ...window, userId })),
      ),
    );

    // One transaction per racer: the lock queues them, so no deadlock retry ran.
    expect(transaction).toHaveBeenCalledTimes(20);
    const failures = results.filter((r) => r.status === 'rejected');
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const f of failures) {
      expect(f.reason).toMatchObject({
        type: 'urn:bseat:problem:booking:seat-unavailable',
      });
    }
    expect(await db.select().from(booking).where(eq(booking.seatId, seat.id))).toHaveLength(1);
  });
});
