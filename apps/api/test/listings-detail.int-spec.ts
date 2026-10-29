import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { z } from 'zod';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { space } from '../src/db/schema/index.js';
import { signedInUser, testDb } from './fixtures.js';
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
const h24 = () => ({
  name: 'Baner Hub',
  description: 'A bright shared office.',
  country: 'IN',
  city: 'Pune',
  area: 'Baner',
  streetAddress: '1 Test Road',
  timeZone: 'Asia/Kolkata',
  currency: 'INR',
  openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
});

describe('listing detail API', () => {
  let app: NestExpressApplication;
  let owner: Agent;
  let renter: Agent;
  let id: string;
  const url = (s = id) => `/api/listings/${s}`;
  const publish = () =>
    testDb(app).update(space).set({ status: 'published' }).where(eq(space.id, id));

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
    renter = (await signedInUser(app, 'r@example.com')).agent;
    id = str((await owner.post('/api/owner/spaces').send(h24())).body.id);
    await owner
      .put(`/api/owner/spaces/${id}/pricing`)
      .send({
        slots: [
          slot('day', true, { day: '500.00', week: '2800' }),
          slot('night', true, { day: '400.00' }),
          slot('full_day', true, { day: '800.00' }),
        ],
      })
      .expect(200);
    await publish();
  });
  afterAll(() => app.close());

  it('lists offered slots and the 24-hour saving (AC 3.5)', async () => {
    const res = await renter.get(url());
    expect(res.status).toBe(200);
    expect(res.body.offers).toEqual([
      {
        slot: 'day',
        startTime: '07:00',
        endTime: '19:00',
        endsNextDay: false,
        prices: { day: '500.00', week: '2800.00', month: null },
      },
      {
        slot: 'night',
        startTime: '19:00',
        endTime: '07:00',
        endsNextDay: true,
        prices: { day: '400.00', week: null, month: null },
      },
      {
        slot: 'full_day',
        startTime: '07:00',
        endTime: '07:00',
        endsNextDay: true,
        prices: { day: '800.00', week: null, month: null },
      },
    ]);
    expect(res.body.fullDaySavings).toEqual({
      day: { amount: '100.00', percent: 11 },
      week: null,
      month: null,
    });
    expect(res.body).toMatchObject({ id, isOwnSpace: false, currency: 'INR', hasLayout: false });
  });

  it('omits disabled slots and unpriced passes (AC 3.3)', async () => {
    await owner
      .put(`/api/owner/spaces/${id}/pricing`)
      .send({
        slots: [
          slot('day', true, { day: '500.00' }),
          slot('night', false, { day: '400.00' }),
          slot('full_day', true),
        ],
      })
      .expect(200);
    const res = await renter.get(url());
    const offers = z.array(z.object({ slot: z.string() })).parse(res.body.offers);
    expect(offers.map((o) => o.slot)).toEqual(['day']);
    expect(res.body.fullDaySavings).toBeNull();
  });

  it('returns 404 for draft, unpublished and unknown spaces', async () => {
    for (const status of ['draft', 'unpublished'] as const) {
      await testDb(app).update(space).set({ status }).where(eq(space.id, id));
      expect((await renter.get(url())).status).toBe(404);
    }
    expect((await renter.get(url('00000000-0000-4000-8000-000000000000'))).status).toBe(404);
  });

  it('flags the owner own space and hides private fields', async () => {
    const res = await owner.get(url());
    expect(res.body.isOwnSpace).toBe(true);
    expect(Object.keys(z.record(z.string(), z.unknown()).parse(res.body)).sort()).toEqual(
      [
        'id',
        'name',
        'description',
        'country',
        'city',
        'area',
        'streetAddress',
        'timeZone',
        'currency',
        'utilities',
        'customUtilities',
        'hasLayout',
        'openingHours',
        'offers',
        'fullDaySavings',
        'isOwnSpace',
        'photos',
        'photoUrlsExpireAt',
      ].sort(),
    );
  });

  it('rejects bad ids and anonymous callers', async () => {
    expect((await renter.get(url('nope'))).status).toBe(400);
    expect((await request(app.getHttpServer()).get(url())).status).toBe(401);
  });
});
