import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { photoObjectPurge, spacePhoto } from '../src/db/schema/index.js';
import { createListing, testDb } from './fixtures.js';
import { createTestApp, resetDb, signedInAgent } from './helpers.js';

const pw = 'correct-horse-battery';

describe('photo reorder and delete API', () => {
  let app: NestExpressApplication;
  let owner: Awaited<ReturnType<typeof signedInAgent>>;
  let other: Awaited<ReturnType<typeof signedInAgent>>;
  let renter: Awaited<ReturnType<typeof signedInAgent>>;
  let spaceId: string;
  const db = () => testDb(app);
  const url = (id = spaceId) => `/api/owner/spaces/${id}/photos`;
  const rows = () =>
    db()
      .select()
      .from(spacePhoto)
      .where(eq(spacePhoto.spaceId, spaceId))
      .orderBy(asc(spacePhoto.position));
  const ids = async () => (await rows()).map((r) => r.id);

  const seed = async (n: number) => {
    for (let i = 0; i < n; i += 1) {
      await db()
        .insert(spacePhoto)
        .values({ spaceId, position: i + 1, displayWidth: 1200, displayHeight: 900 });
    }
    return ids();
  };

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(app);
    owner = await signedInAgent(app, { name: 'A', email: 'a@example.com', password: pw }, 'owner');
    const ownerId = String((await owner.get('/api/me')).body.id);
    other = await signedInAgent(app, { name: 'B', email: 'b@example.com', password: pw }, 'owner');
    renter = await signedInAgent(app, { name: 'R', email: 'r@example.com', password: pw });
    spaceId = (await createListing(db(), ownerId, { name: 'London HQ', status: 'published' })).id;
  });
  afterAll(() => app.close());

  describe('reorder', () => {
    it('puts the 4th first and makes it the cover in the owner list and the listing', async () => {
      const [a, b, c, d, e] = await seed(5);
      const order = [d, a, b, c, e];
      const res = await owner.put(`${url()}/order`).send({ photoIds: order });
      expect(res.status).toBe(200);
      expect((res.body.items as { id: string }[]).map((p) => p.id)).toEqual(order);
      expect(await ids()).toEqual(order);
      expect((await rows()).map((r) => r.position)).toEqual([1, 2, 3, 4, 5]);
      const listing = await renter.get(`/api/listings/${spaceId}`);
      expect((listing.body.photos as { id: string }[])[0]?.id).toBe(d);
    });

    it('409s an order that misses, repeats or adds an id, and changes nothing', async () => {
      const [a, b, c] = await seed(3);
      const before = await ids();
      for (const photoIds of [
        [a, b],
        [a, b, b],
        [a, b, c, randomUUID()],
        [a, b, randomUUID()],
      ]) {
        const res = await owner.put(`${url()}/order`).send({ photoIds });
        expect(res.status).toBe(409);
        expect(res.body.type).toBe('urn:bseat:problem:photo:order-stale');
      }
      expect(await ids()).toEqual(before);
    });

    it('400s an empty, oversized or malformed body', async () => {
      await seed(1);
      for (const body of [
        { photoIds: [] },
        { photoIds: ['x'] },
        {},
        { photoIds: [randomUUID()], a: 1 },
      ]) {
        expect((await owner.put(`${url()}/order`).send(body)).status).toBe(400);
      }
    });
  });

  describe('delete', () => {
    it('removes photo 2 of 5, renumbers, writes a due purge row and 404s the id afterwards', async () => {
      const [a, b, c, d, e] = await seed(5);
      const res = await owner.delete(`${url()}/${b}`);
      expect(res.status).toBe(204);
      expect(await ids()).toEqual([a, c, d, e]);
      expect((await rows()).map((r) => r.position)).toEqual([1, 2, 3, 4]);
      const purge = await db().select().from(photoObjectPurge);
      expect(purge).toHaveLength(1);
      expect(purge[0]).toMatchObject({ photoId: b, spaceId, reason: 'deleted' });
      expect(purge[0]?.dueAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect((await owner.delete(`${url()}/${b}`)).status).toBe(404);
    });

    it('promotes the next photo when the cover goes, and empties the list with the last', async () => {
      const [a, b] = await seed(2);
      await owner.delete(`${url()}/${a}`).expect(204);
      expect(await ids()).toEqual([b]);
      expect((await rows())[0]?.position).toBe(1);
      const listing = await renter.get(`/api/listings/${spaceId}`);
      expect((listing.body.photos as { id: string }[]).map((p) => p.id)).toEqual([b]);
      await owner.delete(`${url()}/${b}`).expect(204);
      expect((await owner.get(url())).body.items).toEqual([]);
    });
  });

  it('survives a reorder racing a delete on the same space (20 runs)', async () => {
    for (let run = 0; run < 20; run += 1) {
      await db().delete(spacePhoto).where(eq(spacePhoto.spaceId, spaceId));
      const [a, b, c, d] = await seed(4);
      const results = await Promise.all([
        owner.put(`${url()}/order`).send({ photoIds: [d, c, b, a] }),
        owner.delete(`${url()}/${b}`),
      ]);
      for (const r of results) expect([200, 204, 409]).toContain(r.status);
      const left = await rows();
      expect(left.map((r) => r.position)).toEqual(left.map((_, i) => i + 1));
      expect(new Set(left.map((r) => r.id)).size).toBe(left.length);
      expect(left).toHaveLength(3);
    }
  });

  it('404s another owner and foreign ids; 403s a renter', async () => {
    const [a] = await seed(2);
    const all = await ids();
    expect((await other.put(`${url()}/order`).send({ photoIds: all })).status).toBe(404);
    expect((await other.delete(`${url()}/${a}`)).status).toBe(404);
    expect((await owner.delete(`${url()}/${randomUUID()}`)).status).toBe(404);
    expect((await owner.put(`${url(randomUUID())}/order`).send({ photoIds: all })).status).toBe(
      404,
    );
    expect((await renter.put(`${url()}/order`).send({ photoIds: all })).status).toBe(403);
    expect((await renter.delete(`${url()}/${a}`)).status).toBe(403);
    expect(await ids()).toEqual(all);
  });
});
