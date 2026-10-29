import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { space } from '../src/db/schema/index.js';
import { createListing, signedInUser, testDb } from './fixtures.js';
import { createTestApp, resetDb, signedInAgent } from './helpers.js';

// Short TTL so the revocation test can wait out expiry. Env is read when AppModule is imported.
vi.hoisted(() => {
  process.env.PHOTO_URL_TTL_SECONDS = '2';
});

const pw = 'correct-horse-battery';

describe('listing photos', () => {
  let app: NestExpressApplication;
  let owner: Awaited<ReturnType<typeof signedInAgent>>;
  let ownerId: string;
  let renter: Awaited<ReturnType<typeof signedInAgent>>;
  let jpeg: Buffer;
  const db = () => testDb(app);

  beforeAll(async () => {
    app = await createTestApp();
    jpeg = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: { r: 9, g: 90, b: 30 } },
    })
      .jpeg()
      .toBuffer();
  });
  beforeEach(async () => {
    await resetDb(app);
    owner = await signedInAgent(app, { name: 'O', email: 'o@example.com', password: pw }, 'owner');
    ownerId = String((await owner.get('/api/me')).body.id);
    renter = (await signedInUser(app, 'r@example.com')).agent;
  });
  afterAll(() => app.close());

  const published = (name: string) =>
    createListing(db(), ownerId, { name, status: 'published', city: 'Pune' });
  const add = (id: string, n: number) =>
    Promise.all(
      Array.from({ length: n }, async () => {
        const res = await owner
          .post(`/api/owner/spaces/${id}/photos`)
          .attach('file', jpeg, 'x.jpg');
        expect(res.status).toBe(201);
      }),
    );

  it('search returns the cover (card only) or null, and no display URL', async () => {
    const withPhotos = await published('Aaa With');
    await published('Bbb Without');
    await add(withPhotos.id, 1);
    await owner.post(`/api/owner/spaces/${withPhotos.id}/photos`).attach('file', jpeg, 'x.jpg');
    const res = await renter.get('/api/listings?country=IN');
    expect(res.status).toBe(200);
    const items = res.body.items as { name: string; cover: unknown }[];
    expect(items[0]?.cover).toMatchObject({
      altText: 'Aaa With photo 1',
      card: { width: 640, height: 480 },
    });
    expect(items[1]?.cover).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('display');
    expect(Date.parse(String(res.body.photoUrlsExpireAt))).toBeGreaterThan(Date.now());
  });

  it('search with no photos has a null expiry', async () => {
    await published('Plain');
    const res = await renter.get('/api/listings?country=IN');
    expect(res.body.photoUrlsExpireAt).toBeNull();
  });

  it('the detail lists photos in order with card and display', async () => {
    const s = await published('Detail Hub');
    await add(s.id, 4);
    const res = await renter.get(`/api/listings/${s.id}`);
    expect(res.status).toBe(200);
    const photos = res.body.photos as { position: number; altText: string; display: unknown }[];
    expect(photos.map((p) => p.position)).toEqual([1, 2, 3, 4]);
    expect(photos[1]?.altText).toBe('Detail Hub photo 2');
    expect(photos[0]?.display).toMatchObject({ width: 1200, height: 900 });
    expect(res.body.photoUrlsExpireAt).not.toBeNull();
  });

  it('a space with no photos has an empty list', async () => {
    const s = await published('Bare');
    const res = await renter.get(`/api/listings/${s.id}`);
    expect(res.body).toMatchObject({ photos: [], photoUrlsExpireAt: null });
  });

  it('hides draft and unpublished spaces with photos', async () => {
    const draft = await createListing(db(), ownerId, { name: 'Draft' });
    await add(draft.id, 1);
    const live = await published('Live');
    await add(live.id, 1);
    await db().update(space).set({ status: 'unpublished' }).where(eq(space.id, live.id));
    expect((await renter.get(`/api/listings/${draft.id}`)).status).toBe(404);
    expect((await renter.get(`/api/listings/${live.id}`)).status).toBe(404);
    expect((await renter.get('/api/listings?country=IN')).body.items).toEqual([]);
  });

  it('401s without a session', async () => {
    const s = await published('X');
    const { default: request } = await import('supertest');
    expect((await request(app.getHttpServer()).get(`/api/listings/${s.id}`)).status).toBe(401);
    expect((await request(app.getHttpServer()).get('/api/listings?country=IN')).status).toBe(401);
  });

  it('a cover URL stops working after unpublish once the TTL passes (FR-019)', async () => {
    const s = await published('Ttl');
    await add(s.id, 1);
    const res = await renter.get('/api/listings?country=IN');
    const url = String(
      (res.body.items as { cover: { card: { url: string } } }[])[0]?.cover.card.url,
    );
    expect((await fetch(url)).status).toBe(200);
    await db().update(space).set({ status: 'unpublished' }).where(eq(space.id, s.id));
    expect((await renter.get('/api/listings?country=IN')).body.items).toEqual([]);
    const expiresAt = Date.parse(String(res.body.photoUrlsExpireAt));
    await new Promise((r) => setTimeout(r, Math.max(0, expiresAt - Date.now()) + 1500));
    expect((await fetch(url)).status).toBe(403);
  }, 20_000);
});
