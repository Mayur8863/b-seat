import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../src/db/db.js';
import {
  availabilityCalendar,
  booking,
  occupancyMark,
  passPrice,
  user,
} from '../src/db/schema/index.js';
import { createListing, createSeats, localDateFromNow, signedInUser, testDb } from './fixtures.js';
import { createTestApp, resetDb } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signedInUser>>['agent'];

const ZONE = 'Asia/Kolkata';
const ROUNDS = 5;

// T044 (mixed slots) and T049 (booking against occupancy marks): SC-005, FR-018. Every round uses a fresh
// seat and date so an earlier round cannot hide a bug, and every racer is a distinct signed-in user.
describe('booking races (SC-005)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let owner: Agent;
  let spaceId: string;
  let seatIds: string[];

  const post = (agent: Agent, body: Record<string, unknown>) =>
    agent.post(`/api/listings/${spaceId}/bookings`).send(body);
  const renters = (n: number, tag: string) =>
    Promise.all(Array.from({ length: n }, (_, i) => signedInUser(app, `${tag}${i}@example.com`)));

  beforeAll(async () => {
    app = await createTestApp();
    db = testDb(app);
  });
  beforeEach(async () => {
    await resetDb(app);
    const o = await signedInUser(app, 'owner@example.com', 'Owner');
    owner = o.agent;
    await db.update(user).set({ accountType: 'owner' }).where(eq(user.id, o.userId));
    const s = await createListing(db, o.userId, {
      status: 'published',
      timeZone: ZONE,
      openingMode: 'always_open',
      shiftChangeAt: '07:00',
      opensAt: null,
      closesAt: null,
    });
    spaceId = s.id;
    seatIds = (await createSeats(db, spaceId, ROUNDS)).map((x) => x.id);
    await db.insert(availabilityCalendar).values({ spaceId, startDate: '2020-01-01' });
    await db.insert(passPrice).values(
      (['day', 'night', 'full_day'] as const).map((slot) => ({
        spaceId,
        slot,
        pass: 'day' as const,
        amount: '500.00',
      })),
    );
  });
  afterAll(() => app.close());

  it('mixed slots: 24 hours blocks both, day and night coexist, in every round', async () => {
    const users = await renters(30, 'mix');
    for (let round = 0; round < ROUNDS; round += 1) {
      const seatId = seatIds[round];
      if (!seatId) throw new Error('seat');
      const startDate = localDateFromNow(3 + round, ZONE);
      const slots = ['full_day', 'day', 'night'] as const;
      const results = await Promise.all(
        users.map((u, i) =>
          post(u.agent, { seatId, pass: 'day', slot: slots[i % 3], startDate }).then((r) => ({
            slot: slots[i % 3],
            status: r.status,
          })),
        ),
      );
      const created = results.filter((r) => r.status === 201).map((r) => r.slot);
      expect(
        results.filter((r) => r.status !== 201 && r.status !== 409),
        `round ${round}`,
      ).toEqual([]);
      expect([['full_day'], ['day', 'night'], ['night', 'day']]).toContainEqual(created);
      const rows = await db
        .select({ slot: booking.slot })
        .from(booking)
        .where(and(eq(booking.seatId, seatId), eq(booking.startDate, startDate)));
      expect(rows.map((r) => r.slot).sort()).toEqual([...created].sort());
    }
  }, 120_000);

  it('booking against occupancy: exactly one of 10 bookings and 10 marks wins, in every round', async () => {
    const users = await renters(10, 'bm');
    for (let round = 0; round < ROUNDS; round += 1) {
      const seatId = seatIds[round];
      if (!seatId) throw new Error('seat');
      const date = localDateFromNow(3 + round, ZONE);
      const results = await Promise.all([
        ...users.map((u) =>
          post(u.agent, { seatId, pass: 'day', slot: 'day', startDate: date }).then((r) => ({
            kind: 'booking',
            status: r.status,
          })),
        ),
        ...Array.from({ length: 10 }, () =>
          owner
            .post(`/api/owner/spaces/${spaceId}/occupancy`)
            .send({ seatIds: [seatId], startDate: date, endDate: date, note: null })
            .then((r) => ({ kind: 'mark', status: r.status })),
        ),
      ]);
      expect(
        results.filter((r) => r.status !== 201 && r.status !== 409),
        `round ${round}`,
      ).toEqual([]);
      expect(
        results.filter((r) => r.status === 201),
        `round ${round}`,
      ).toHaveLength(1);
      const bookings = await db
        .select({ id: booking.id })
        .from(booking)
        .where(eq(booking.seatId, seatId));
      const marks = await db
        .select({ id: occupancyMark.id })
        .from(occupancyMark)
        .where(eq(occupancyMark.seatId, seatId));
      expect(bookings.length + marks.length).toBe(1);
    }
  }, 120_000);
});
