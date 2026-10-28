import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seat, space } from '../src/db/schema/index.js';
import { insertHold, insertPassBooking, localInstant, signedInUser, testDb } from './fixtures.js';
import { createTestApp, resetDb, signedInAgent } from './helpers.js';

type Agent = Awaited<ReturnType<typeof signedInAgent>>;
const str = (v: unknown): string => {
  if (typeof v !== 'string') throw new Error('expected a string');
  return v;
};
const none = { day: null, week: null, month: null };
const slot = (kind: string, prices: Record<string, string | null> = {}) => ({
  slot: kind,
  enabled: true,
  prices: { ...none, ...prices },
});

const PageSchema = z.object({
  items: z.array(z.object({ name: z.string() })),
  nextCursor: z.string().nullable(),
});
const ZONE = 'Asia/Kolkata';
const MONDAY = '2030-01-07';

describe('listing search availability filter', () => {
  let app: NestExpressApplication;
  let owner: Agent;
  let renter: Agent;
  let holders = 0;

  async function make(name: string, labels: string[], slots = defaultSlots): Promise<string[]> {
    const id = str(
      (
        await owner.post('/api/owner/spaces').send({
          name,
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
    await owner.put(`/api/owner/spaces/${id}/pricing`).send({ slots }).expect(200);
    const created = await testDb(app)
      .insert(seat)
      .values(labels.map((label) => ({ spaceId: id, label })))
      .returning();
    await testDb(app).update(space).set({ status: 'published' }).where(eq(space.id, id));
    return [id, ...created.sort((a, b) => a.label.localeCompare(b.label)).map((s) => s.id)];
  }
  const defaultSlots = [
    slot('day', { day: '500.00', week: '2800', month: '9000' }),
    slot('night', { day: '400.00' }),
    slot('full_day'),
  ];

  /** A one-day day-slot hold (07:00-19:00 local). */
  async function holdDay(seatId: string, date: string, slotKind: 'day' | 'night' = 'day') {
    const next = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
    const [from, to] =
      slotKind === 'day'
        ? [localInstant(date, '07:00', ZONE), localInstant(date, '19:00', ZONE)]
        : [localInstant(date, '19:00', ZONE), localInstant(next, '07:00', ZONE)];
    // The same user cannot hold overlapping instants, so every hold gets its own booker.
    holders += 1;
    const userId = (await signedInUser(app, `holder${holders}@example.com`)).userId;
    const b = await insertPassBooking(testDb(app), {
      seatId,
      userId,
      startsAt: from,
      endsAt: to,
      pass: 'day',
      slot: slotKind,
      startDate: date,
      endDate: date,
    });
    await insertHold(testDb(app), {
      seatId,
      userId,
      bookingId: b.id,
      startsAt: from,
      endsAt: to,
      serviceDate: date,
    });
  }
  const search = async (q: string) => {
    const res = await renter.get(`/api/listings?country=IN&${q}`).expect(200);
    return (res.body as { items: { name: string }[] }).items.map((i) => i.name);
  };

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
    holders = 0;
  });
  afterAll(() => app.close());

  it('keeps only the space with a seat free for the whole week (AC 4.3)', async () => {
    const [, p1] = await make('P', ['A1', 'A2']);
    const [, q1, q2] = await make('Q', ['B1', 'B2']);
    await holdDay(str(q1), '2030-01-09');
    await holdDay(str(q2), '2030-01-10');
    expect(p1).toBeDefined();
    expect(await search(`startDate=${MONDAY}&pass=week&slot=day`)).toEqual(['P']);
  });

  it('leaves out a space whose free days are scattered for a monthly pass', async () => {
    const [, a, b] = await make('Scattered', ['A1', 'A2']);
    await holdDay(str(a), '2030-01-10');
    await holdDay(str(b), '2030-01-20');
    await make('Open', ['C1']);
    expect(await search(`startDate=${MONDAY}&pass=month&slot=day`)).toEqual(['Open']);
  });

  it('ignores holds in other slots', async () => {
    const [, a] = await make('Only', ['A1']);
    await holdDay(str(a), MONDAY, 'night');
    expect(await search(`startDate=${MONDAY}&pass=day&slot=day`)).toEqual(['Only']);
    expect(await search(`startDate=${MONDAY}&pass=day&slot=night`)).toEqual([]);
  });

  it('applies the OQ-4 rule: startDate alone means a free day pass in any offered slot', async () => {
    const [, a] = await make('Day taken', ['A1']);
    await holdDay(str(a), MONDAY, 'day');
    const [, b] = await make('Both taken', ['B1']);
    await holdDay(str(b), MONDAY, 'day');
    await holdDay(str(b), MONDAY, 'night');
    await make('Free', ['C1']);
    expect(await search(`startDate=${MONDAY}`)).toEqual(['Day taken', 'Free']);
  });

  it('pages through filtered results without gaps', async () => {
    for (const n of ['S1', 'S2', 'S3']) {
      const [, s] = await make(n, ['A']);
      if (n === 'S2') await holdDay(str(s), MONDAY);
    }
    const page = async (cursor?: string) => {
      const res = await renter
        .get(
          `/api/listings?country=IN&startDate=${MONDAY}&pass=day&slot=day&limit=1${cursor ? `&cursor=${cursor}` : ''}`,
        )
        .expect(200);
      return PageSchema.parse(res.body);
    };
    const first = await page();
    expect(first.items.map((i) => i.name)).toEqual(['S1']);
    const second = await page(first.nextCursor ?? undefined);
    expect(second.items.map((i) => i.name)).toEqual(['S3']);
    expect(second.nextCursor).toBeNull();
  });
});
