import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { cubicle, seat } from '../src/db/schema/index.js';
import {
  createCubicle,
  createListing,
  createSeats,
  insertPassBooking,
  signedInUser,
  testDb,
} from './fixtures.js';
import { createTestApp, resetDb, signedInAgent } from './helpers.js';

const DAY = 86_400_000;
const labels = (res: { body: { items: { label: string }[] } }) =>
  res.body.items.map((s) => s.label);

describe('owner seats and cubicles API', () => {
  let app: NestExpressApplication;
  let a: Awaited<ReturnType<typeof signedInAgent>>;
  let b: Awaited<ReturnType<typeof signedInAgent>>;
  let renter: Awaited<ReturnType<typeof signedInAgent>>;
  let renterId: string;
  let spaceId: string;
  let base: string;
  const db = () => testDb(app);

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(app);
    const pw = 'correct-horse-battery';
    a = await signedInAgent(app, { name: 'A', email: 'a@example.com', password: pw }, 'owner');
    const aId = String((await a.get('/api/me')).body.id);
    b = await signedInAgent(app, { name: 'B', email: 'b@example.com', password: pw }, 'owner');
    const r = await signedInUser(app, 'r@example.com');
    renter = r.agent;
    renterId = String((await renter.get('/api/me')).body.id);
    spaceId = (await createListing(db(), aId)).id;
    base = `/api/owner/spaces/${spaceId}`;
  });
  afterAll(() => app.close());

  const addPattern = (over: Record<string, unknown> = {}, agent = a) =>
    agent.post(`${base}/seats`).send({ pattern: { prefix: 'A-', from: 1, to: 20, ...over } });

  describe('seats', () => {
    it('bulk adds a pattern (AC 2.3)', async () => {
      const res = await addPattern().expect(201);
      expect(res.body.items).toHaveLength(20);
      expect(labels(res)).toContain('A-20');
      expect(res.body.items[0]).toMatchObject({
        features: [],
        cubicle: null,
        calendar: 'shared',
        today: { state: 'vacant', note: null, markId: null },
      });
      const list = await a.get(`${base}/seats`).expect(200);
      expect(labels(list)).toHaveLength(20);
    });

    it('pads numbers and adds explicit seats with features and a cubicle', async () => {
      const cub = (await a.post(`${base}/cubicles`).send({ name: 'Bay 1' }).expect(201)).body;
      const res = await a
        .post(`${base}/seats`)
        .send({ seats: [{ label: 'X1', cubicleId: cub.id, features: ['Dock'] }] })
        .expect(201);
      expect(res.body.items[0]).toMatchObject({
        label: 'X1',
        features: ['Dock'],
        cubicle: { id: cub.id, name: 'Bay 1' },
      });
      const p = await addPattern({ prefix: 'P', from: 1, to: 2, padTo: 3 }).expect(201);
      expect(labels(p).sort()).toEqual(['P001', 'P002']);
    });

    it('409 label-taken and creates nothing (FR-007)', async () => {
      await addPattern({ from: 1, to: 1 }).expect(201);
      const res = await addPattern({ from: 1, to: 5 }).expect(409);
      expect(res.body).toMatchObject({
        type: 'urn:bseat:problem:listing:label-taken',
        title: 'Seat label already used',
        labels: ['A-1'],
      });
      const rows = await db().select().from(seat).where(eq(seat.spaceId, spaceId));
      expect(rows).toHaveLength(1);
    });

    it('409 for a duplicate label inside one request', async () => {
      const res = await a
        .post(`${base}/seats`)
        .send({ seats: [{ label: 'Z' }, { label: 'Z' }] })
        .expect(409);
      expect(res.body.labels).toEqual(['Z']);
    });

    it('422 seat-limit over 200 active seats; removed seats do not count', async () => {
      await createSeats(db(), spaceId, 195);
      const res = await addPattern({ from: 1, to: 6, prefix: 'N' }).expect(422);
      expect(res.body).toMatchObject({
        type: 'urn:bseat:problem:listing:seat-limit',
        title: 'Seat limit reached',
        detail: 'A space can have at most 200 seats. No seats were added.',
      });
      expect(await db().select().from(seat).where(eq(seat.spaceId, spaceId))).toHaveLength(195);
      await addPattern({ from: 1, to: 5, prefix: 'N' }).expect(201);
    });

    it('lets exactly one of two concurrent 150-seat adds win (R-15)', async () => {
      const [r1, r2] = await Promise.all([
        addPattern({ prefix: 'P', from: 1, to: 150 }),
        addPattern({ prefix: 'Q', from: 1, to: 150 }),
      ]);
      expect([r1.status, r2.status].sort()).toEqual([201, 422]);
      expect(await db().select().from(seat).where(eq(seat.spaceId, spaceId))).toHaveLength(150);
    });

    it('400 on bad fields', async () => {
      const eleven = Array.from({ length: 11 }, (_, i) => `f${i}`);
      for (const features of [eleven, ['x'.repeat(41)], ['Dock', 'dock']]) {
        const res = await a
          .post(`${base}/seats`)
          .send({ seats: [{ label: 'A', features }] })
          .expect(400);
        expect(res.body.errors[0].path).toContain('features');
      }
      const res = await addPattern({ prefix: 'abcdefghijklmno', from: 1, to: 100000 }).expect(400);
      expect(JSON.stringify(res.body.errors)).toContain('pattern.prefix');
      await a.post(`${base}/seats`).send({ seats: [] }).expect(400);
    });

    it('updates label, features and cubicle; 409 on a taken label', async () => {
      const res = await addPattern({ from: 1, to: 2 }).expect(201);
      const [s1, s2] = res.body.items;
      const cub = (await a.post(`${base}/cubicles`).send({ name: 'Bay 1' })).body;
      const up = await a
        .patch(`${base}/seats/${s1.id}`)
        .send({ label: 'B-1', features: ['Dock'], cubicleId: cub.id })
        .expect(200);
      expect(up.body).toMatchObject({
        label: 'B-1',
        features: ['Dock'],
        cubicle: { name: 'Bay 1' },
      });
      const clear = await a.patch(`${base}/seats/${s1.id}`).send({ cubicleId: null }).expect(200);
      expect(clear.body.cubicle).toBeNull();
      const dup = await a.patch(`${base}/seats/${s2.id}`).send({ label: 'B-1' }).expect(409);
      expect(dup.body.labels).toEqual(['B-1']);
      await a.patch(`${base}/seats/${s1.id}`).send({}).expect(400);
      await a.patch(`${base}/seats/${s1.id}`).send({ cubicleId: randomUUID() }).expect(404);
    });

    it('deletes a seat with only past holds, refuses a future booking (FR-007)', async () => {
      const [s1, s2] = await createSeats(db(), spaceId, 2);
      if (!s1 || !s2) throw new Error('seats');
      const now = Date.now();
      await insertPassBooking(db(), {
        seatId: s1.id,
        userId: renterId,
        startsAt: new Date(now + DAY),
        endsAt: new Date(now + 2 * DAY),
      });
      const res = await a.delete(`${base}/seats/${s1.id}`).expect(409);
      expect(res.body).toMatchObject({
        type: 'urn:bseat:problem:listing:seat-has-future-bookings',
        title: 'Upcoming bookings',
      });
      await insertPassBooking(db(), {
        seatId: s2.id,
        userId: renterId,
        startsAt: new Date(now - 3 * DAY),
        endsAt: new Date(now - 2 * DAY),
      });
      await a.delete(`${base}/seats/${s2.id}`).expect(204);
      const list = await a.get(`${base}/seats`);
      expect(labels(list)).toEqual(['S-01']);
      const [row] = await db().select().from(seat).where(eq(seat.id, s2.id));
      expect(row?.removedAt).not.toBeNull();
      await a.delete(`${base}/seats/${s2.id}`).expect(404);
    });

    it('a removed seat frees its label', async () => {
      const [s1] = await createSeats(db(), spaceId, 1);
      if (!s1) throw new Error('seat');
      await a.delete(`${base}/seats/${s1.id}`).expect(204);
      await a
        .post(`${base}/seats`)
        .send({ seats: [{ label: s1.label }] })
        .expect(201);
    });
  });

  describe('cubicles', () => {
    it('creates, lists with seat counts, renames (AC 2.3)', async () => {
      const c = (await a.post(`${base}/cubicles`).send({ name: ' Bay 1 ' }).expect(201)).body;
      expect(c).toMatchObject({ name: 'Bay 1', seatCount: 0 });
      await a.post(`${base}/seats`).send({ seats: [{ label: 'S', cubicleId: c.id }] });
      const list = await a.get(`${base}/cubicles`).expect(200);
      expect(list.body.items).toEqual([{ id: c.id, name: 'Bay 1', seatCount: 1 }]);
      const r = await a.patch(`${base}/cubicles/${c.id}`).send({ name: 'Bay 9' }).expect(200);
      expect(r.body.name).toBe('Bay 9');
      const seats = await a.get(`${base}/seats`);
      expect(seats.body.items[0].cubicle.name).toBe('Bay 9');
    });

    it('409 on a duplicate name at create and rename', async () => {
      await a.post(`${base}/cubicles`).send({ name: 'Bay 1' }).expect(201);
      const dup = await a.post(`${base}/cubicles`).send({ name: 'Bay 1' }).expect(409);
      expect(dup.body).toMatchObject({
        type: 'urn:bseat:problem:listing:cubicle-name-taken',
        title: 'Cubicle name already used',
      });
      const c2 = (await a.post(`${base}/cubicles`).send({ name: 'Bay 2' })).body;
      await a.patch(`${base}/cubicles/${c2.id}`).send({ name: 'Bay 1' }).expect(409);
      await a.patch(`${base}/cubicles/${c2.id}`).send({ name: 'Bay 2' }).expect(200);
    });

    it('400 on a 101-character name', async () => {
      const res = await a
        .post(`${base}/cubicles`)
        .send({ name: 'x'.repeat(101) })
        .expect(400);
      expect(res.body.errors[0].path).toBe('name');
    });

    it('soft-deletes a cubicle and its seats when only past bookings exist (OQ-6)', async () => {
      const c = await createCubicle(db(), spaceId, { name: 'Bay 1' });
      const [s1] = await createSeats(db(), spaceId, 1);
      if (!s1) throw new Error('seat');
      await db().update(seat).set({ cubicleId: c.id }).where(eq(seat.id, s1.id));
      const now = Date.now();
      await insertPassBooking(db(), {
        seatId: s1.id,
        userId: renterId,
        startsAt: new Date(now - 3 * DAY),
        endsAt: new Date(now - 2 * DAY),
      });
      await a.delete(`${base}/cubicles/${c.id}`).expect(204);
      const [cr] = await db().select().from(cubicle).where(eq(cubicle.id, c.id));
      const [sr] = await db().select().from(seat).where(eq(seat.id, s1.id));
      expect(cr?.removedAt).not.toBeNull();
      expect(sr?.removedAt).not.toBeNull();
      expect((await a.get(`${base}/cubicles`)).body.items).toEqual([]);
      expect((await a.get(`${base}/seats`)).body.items).toEqual([]);
    });

    it('409 and changes nothing when a seat has a future booking', async () => {
      const c = await createCubicle(db(), spaceId, { name: 'Bay 1' });
      const [s1] = await createSeats(db(), spaceId, 1);
      if (!s1) throw new Error('seat');
      await db().update(seat).set({ cubicleId: c.id }).where(eq(seat.id, s1.id));
      await insertPassBooking(db(), {
        seatId: s1.id,
        userId: renterId,
        startsAt: new Date(Date.now() + DAY),
        endsAt: new Date(Date.now() + 2 * DAY),
      });
      const res = await a.delete(`${base}/cubicles/${c.id}`).expect(409);
      expect(res.body.type).toBe('urn:bseat:problem:listing:seat-has-future-bookings');
      const [cr] = await db().select().from(cubicle).where(eq(cubicle.id, c.id));
      const [sr] = await db().select().from(seat).where(eq(seat.id, s1.id));
      expect(cr?.removedAt).toBeNull();
      expect(sr?.removedAt).toBeNull();
    });

    it('a removed cubicle name can be reused', async () => {
      const c = (await a.post(`${base}/cubicles`).send({ name: 'Bay 1' })).body;
      await a.delete(`${base}/cubicles/${c.id}`).expect(204);
      await a.post(`${base}/cubicles`).send({ name: 'Bay 1' }).expect(201);
    });
  });

  describe('access', () => {
    it('401 without a session and 403 for a renter', async () => {
      const { default: request } = await import('supertest');
      await request(app.getHttpServer()).get(`${base}/seats`).expect(401);
      await renter.get(`${base}/seats`).expect(403);
      await renter.post(`${base}/cubicles`).send({ name: 'x' }).expect(403);
    });

    it("404 parity for another owner's space, seats and cubicles (FR-009)", async () => {
      const [s1] = await createSeats(db(), spaceId, 1);
      const c = await createCubicle(db(), spaceId);
      if (!s1) throw new Error('seat');
      const ghost = randomUUID();
      const check = async (
        method: 'get' | 'post' | 'patch' | 'delete',
        path: string,
        send?: object,
      ) => {
        const foreign = await b[method](`${base}${path}`).send(send);
        const missing = await b[method](`/api/owner/spaces/${ghost}${path}`).send(send);
        expect(foreign.status).toBe(404);
        expect(foreign.body).toEqual({
          ...missing.body,
          instance: foreign.body.instance,
          requestId: foreign.body.requestId,
        });
      };
      await check('get', '/seats');
      await check('post', '/seats', { seats: [{ label: 'Q' }] });
      await check('patch', `/seats/${s1.id}`, { label: 'Q' });
      await check('delete', `/seats/${s1.id}`);
      await check('get', '/cubicles');
      await check('post', '/cubicles', { name: 'Q' });
      await check('patch', `/cubicles/${c.id}`, { name: 'Q' });
      await check('delete', `/cubicles/${c.id}`);
      // A's own space with a seat or cubicle of another space is also 404.
      const own = (await createListing(db(), String((await b.get('/api/me')).body.id))).id;
      await b.patch(`/api/owner/spaces/${own}/seats/${s1.id}`).send({ label: 'Q' }).expect(404);
      await b.delete(`/api/owner/spaces/${own}/cubicles/${c.id}`).expect(404);
      await b
        .post(`/api/owner/spaces/${own}/seats`)
        .send({ seats: [{ label: 'Q', cubicleId: c.id }] })
        .expect(404);
    });
  });
});
