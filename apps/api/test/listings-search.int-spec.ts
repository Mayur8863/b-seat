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
const items = (res: { body: unknown }): { id?: unknown; name?: unknown }[] =>
  z
    .array(z.record(z.string(), z.unknown()))
    .parse(z.object({ items: z.unknown() }).parse(res.body).items);
const ids = (res: { body: unknown }): unknown[] => items(res).map((i) => i.id);
const names = (res: { body: unknown }): unknown[] => items(res).map((i) => i.name);
const none = { day: null, week: null, month: null };
const slot = (kind: string, prices: Record<string, string | null> = {}) => ({
  slot: kind,
  enabled: true,
  prices: { ...none, ...prices },
});

describe('listing search API', () => {
  let app: NestExpressApplication;
  let owner: Agent;
  let renter: Agent;

  async function make(
    name: string,
    where: { country?: string; city: string; area?: string },
    extra: Record<string, unknown> = {},
    slots = [slot('day', { day: '500.00', week: '2800' }), slot('night', { day: '400.00' })],
    publish = true,
  ): Promise<string> {
    const res = await owner.post('/api/owner/spaces').send({
      name,
      description: 'Nice.',
      country: where.country ?? 'IN',
      city: where.city,
      area: where.area ?? 'Centre',
      streetAddress: '1 Test Road',
      timeZone: 'Asia/Kolkata',
      currency: 'INR',
      openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
      ...extra,
    });
    expect(res.status).toBe(201);
    const id = str(res.body.id);
    await owner.put(`/api/owner/spaces/${id}/pricing`).send({ slots }).expect(200);
    if (publish)
      await testDb(app).update(space).set({ status: 'published' }).where(eq(space.id, id));
    return id;
  }

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
  });
  afterAll(() => app.close());

  it('requires a session and a country', async () => {
    await request(app.getHttpServer()).get('/api/listings?country=IN').expect(401);
    await request(app.getHttpServer())
      .get('/api/listings/locations?country=IN&field=city&q=p')
      .expect(401);
    expect((await renter.get('/api/listings')).status).toBe(400);
    expect((await renter.get('/api/listings?country=IN&bogus=1')).status).toBe(400);
    expect((await renter.get('/api/listings?country=IN&cursor=junk')).status).toBe(400);
    expect((await renter.get('/api/listings?country=IN&limit=51')).status).toBe(400);
  });

  it('returns only published spaces in the trimmed, case-insensitive city (AC 4.1, 4.2)', async () => {
    const pune = await make('Pune HQ', { city: 'Pune' });
    await make('London HQ', { country: 'GB', city: 'London' });
    await make('Draft Pune', { city: 'Pune' }, {}, undefined, false);
    const res = await renter.get('/api/listings?country=IN&city=%20PUNE%20');
    expect(res.status).toBe(200);
    expect(ids(res)).toEqual([pune]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('shows name, area, city, utilities and the lowest price per pass type (FR-015)', async () => {
    await make(
      'Pune HQ',
      { city: 'Pune', area: 'Baner' },
      { utilities: ['wifi'], customUtilities: ['Rooftop'] },
      [
        slot('day', { day: '500.00', week: '2800' }),
        slot('night', { day: '400.00', week: '3000' }),
      ],
    );
    const [item] = (await renter.get('/api/listings?country=IN')).body.items;
    expect(item).toMatchObject({
      name: 'Pune HQ',
      area: 'Baner',
      city: 'Pune',
      country: 'IN',
      currency: 'INR',
      utilities: ['wifi'],
      customUtilities: ['Rooftop'],
      hasLayout: false,
      lowestPrices: { day: '400.00', week: '2800.00', month: null },
    });
    expect(item).not.toHaveProperty('ownerId');
  });

  it('requires every chosen utility (AC 4.3)', async () => {
    const both = await make('Both', { city: 'Pune' }, { utilities: ['wifi', 'parking'] });
    await make('Wifi only', { city: 'Pune' }, { utilities: ['wifi'] });
    const res = await renter.get('/api/listings?country=IN&utilities=wifi&utilities=parking');
    expect(ids(res)).toEqual([both]);
    expect((await renter.get('/api/listings?country=IN&utilities=wifi')).body.items).toHaveLength(
      2,
    );
  });

  it('filters by area and by offered pass and slot', async () => {
    const a = await make('A', { city: 'Pune', area: 'Baner' });
    await make('B', { city: 'Pune', area: 'Kothrud' }, {}, [slot('day', { day: '100' })]);
    expect((await renter.get('/api/listings?country=IN&area=%20baner')).body.items[0].id).toBe(a);
    const week = await renter.get('/api/listings?country=IN&pass=week');
    expect(ids(week)).toEqual([a]);
    const night = await renter.get('/api/listings?country=IN&slot=night');
    expect(ids(night)).toEqual([a]);
    const both = await renter.get('/api/listings?country=IN&slot=night&pass=week');
    expect(both.body.items).toEqual([]);
  });

  it('pages by name then id with an opaque cursor (OQ-12)', async () => {
    for (let i = 0; i < 5; i += 1) await make(`Space ${i}`, { city: 'Pune' });
    const first = await renter.get('/api/listings?country=IN&limit=3');
    expect(names(first)).toEqual(['Space 0', 'Space 1', 'Space 2']);
    const next = str(first.body.nextCursor);
    const second = await renter.get(`/api/listings?country=IN&limit=3&cursor=${next}`);
    expect(names(second)).toEqual(['Space 3', 'Space 4']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('returns an empty page when nothing matches', async () => {
    const res = await renter.get('/api/listings?country=IN&city=Nowhere');
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  describe('locations', () => {
    it('suggests the most common spelling from published spaces only, with counts (AC 4.2)', async () => {
      await make('A', { city: 'Pune' });
      await make('B', { city: 'Pune' });
      await make('C', { city: ' pune ' });
      await make('D', { city: 'Pulwama' });
      await make('E', { city: 'Puri' }, {}, undefined, false);
      await make('F', { country: 'GB', city: 'Puddle' });
      const res = await renter.get('/api/listings/locations?country=IN&field=city&q=PU');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([
        { value: 'Pune', count: 3 },
        { value: 'Pulwama', count: 1 },
      ]);
    });

    it('suggests areas within a city and requires the city', async () => {
      await make('A', { city: 'Pune', area: 'Baner' });
      await make('B', { city: 'Mumbai', area: 'Bandra' });
      const res = await renter.get('/api/listings/locations?country=IN&field=area&city=pune&q=ba');
      expect(res.body.items).toEqual([{ value: 'Baner', count: 1 }]);
      expect((await renter.get('/api/listings/locations?country=IN&field=area&q=ba')).status).toBe(
        400,
      );
    });

    it('matches % and _ literally and caps at 10', async () => {
      await make('A', { city: 'Pune' });
      await make('B', { city: '100% Town' });
      expect(
        (await renter.get('/api/listings/locations?country=IN&field=city&q=%25')).body.items,
      ).toEqual([]);
      expect(
        (await renter.get('/api/listings/locations?country=IN&field=city&q=100%25')).body.items,
      ).toEqual([{ value: '100% Town', count: 1 }]);
      expect(
        (await renter.get('/api/listings/locations?country=IN&field=city&q=_')).body.items,
      ).toEqual([]);
      for (let i = 0; i < 11; i += 1)
        await make(`X${i}`, { city: `Zed${String(i).padStart(2, '0')}` });
      const res = await renter.get('/api/listings/locations?country=IN&field=city&q=zed');
      expect(res.body.items).toHaveLength(10);
      expect((await renter.get('/api/listings/locations?country=IN&field=city&q=')).status).toBe(
        400,
      );
    });
  });
});
