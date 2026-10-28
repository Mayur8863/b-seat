import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { eq } from 'drizzle-orm';

import { space } from '../src/db/schema/index.js';
import { createCubicle, createListing, createSeats, signedInUser, testDb } from './fixtures.js';
import { createTestApp, resetDb, signedInAgent } from './helpers.js';

const STALE = 'urn:bseat:problem:layout:stale-version';
const OOB = 'urn:bseat:problem:layout:out-of-bounds';

describe('layout API', () => {
  let app: NestExpressApplication;
  let a: Awaited<ReturnType<typeof signedInAgent>>;
  let b: Awaited<ReturnType<typeof signedInAgent>>;
  let renter: Awaited<ReturnType<typeof signedInAgent>>;
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
    renter = (await signedInUser(app, 'r@example.com')).agent;
    spaceId = (await createListing(db(), aId, { status: 'published' })).id;
    base = `/api/owner/spaces/${spaceId}/layout`;
  });
  afterAll(() => app.close());

  const save = (body: Record<string, unknown>, agent = a) => agent.put(base).send(body);
  const grid = { columns: 40, rows: 30 };

  it('returns an empty version 0 layout with every seat unplaced (AC 8.2)', async () => {
    const seats = await createSeats(db(), spaceId, 3);
    const res = await a.get(base).expect(200);
    expect(res.body).toMatchObject({ version: 0, elements: [], columns: 40, rows: 30 });
    expect([...(res.body.unplacedSeatIds as string[])].sort()).toEqual(
      seats.map((s) => s.id).sort(),
    );
  });

  it('saves 6 seats, 2 cubicles and an area, and the renter reads them (AC 8.1, 8.4)', async () => {
    const seats = await createSeats(db(), spaceId, 6);
    const c1 = await createCubicle(db(), spaceId, { name: 'Pod 1' });
    const c2 = await createCubicle(db(), spaceId, { name: 'Pod 2' });
    const elements = [
      ...seats.map((s, i) => ({ kind: 'seat', seatId: s.id, x: i * 2, y: 0, w: 1, h: 1 })),
      { kind: 'cubicle', cubicleId: c1.id, x: 0, y: 5, w: 4, h: 4 },
      { kind: 'cubicle', cubicleId: c2.id, x: 6, y: 5, w: 4, h: 4 },
      { kind: 'area', label: 'Meeting room', x: 20, y: 20, w: 6, h: 4 },
    ];
    const res = await save({ version: 0, ...grid, elements }).expect(200);
    expect(res.body.version).toBe(1);
    expect(res.body.elements).toHaveLength(9);
    expect(res.body.unplacedSeatIds).toEqual([]);
    const labels = (res.body.elements as { label: string }[]).map((e) => e.label);
    expect(labels).toEqual(expect.arrayContaining(['S-01', 'Pod 1', 'Meeting room']));

    const view = await renter.get(`/api/listings/${spaceId}/layout`).expect(200);
    expect(view.body).toMatchObject({ columns: 40, rows: 30 });
    expect(view.body.elements).toHaveLength(9);
    expect(view.body.elements[0]).not.toHaveProperty('id');
    const seatEl = (view.body.elements as { seatId: string }[]).find(
      (e) => e.seatId === seats[0]?.id,
    );
    expect(seatEl).toMatchObject({ kind: 'seat', label: 'S-01' });

    const listing = await renter.get(`/api/listings/${spaceId}`).expect(200);
    expect(listing.body.hasLayout).toBe(true);
    const owned = await a.get(`/api/owner/spaces/${spaceId}`).expect(200);
    expect(owned.body.hasLayout).toBe(true);
  });

  it('replaces the previous geometry on each save', async () => {
    const [s1, s2] = await createSeats(db(), spaceId, 2);
    await save({
      version: 0,
      ...grid,
      elements: [{ kind: 'seat', seatId: s1?.id, x: 0, y: 0, w: 1, h: 1 }],
    }).expect(200);
    const res = await save({
      version: 1,
      ...grid,
      elements: [{ kind: 'seat', seatId: s2?.id, x: 3, y: 3, w: 1, h: 1 }],
    }).expect(200);
    expect(res.body.version).toBe(2);
    expect(res.body.elements).toHaveLength(1);
    expect(res.body.unplacedSeatIds).toEqual([s1?.id]);
  });

  it('rejects a stale version with 409 (FR-029)', async () => {
    const [s] = await createSeats(db(), spaceId, 1);
    const body = {
      ...grid,
      elements: [{ kind: 'seat', seatId: s?.id, x: 0, y: 0, w: 1, h: 1 }],
    };
    await save({ version: 0, ...body }).expect(200);
    const res = await save({ version: 0, ...body }).expect(409);
    expect(res.body.type).toBe(STALE);
  });

  it('rejects stale version 1 against an empty layout', async () => {
    const res = await save({ version: 3, ...grid, elements: [] }).expect(409);
    expect(res.body.type).toBe(STALE);
  });

  it('rejects an element outside the grid with 422', async () => {
    const res = await save({
      version: 0,
      ...grid,
      elements: [{ kind: 'area', label: 'Kitchen', x: 38, y: 0, w: 5, h: 2 }],
    }).expect(422);
    expect(res.body.type).toBe(OOB);
    expect((await a.get(base).expect(200)).body.version).toBe(0);
  });

  it('rejects a seat outside its placed cubicle, and checks nothing for an unplaced cubicle', async () => {
    const c = await createCubicle(db(), spaceId, { name: 'Pod 1' });
    const [s] = await createSeats(db(), spaceId, 1);
    await a
      .patch(`/api/owner/spaces/${spaceId}/seats/${s?.id}`)
      .send({ cubicleId: c.id })
      .expect(200);
    const seatEl = { kind: 'seat', seatId: s?.id, x: 10, y: 10, w: 1, h: 1 };
    await save({ version: 0, ...grid, elements: [seatEl] }).expect(200);
    const outside = await save({
      version: 1,
      ...grid,
      elements: [seatEl, { kind: 'cubicle', cubicleId: c.id, x: 0, y: 0, w: 3, h: 3 }],
    }).expect(422);
    expect(outside.body.type).toBe(OOB);
    await save({
      version: 1,
      ...grid,
      elements: [
        { ...seatEl, x: 1, y: 1 },
        { kind: 'cubicle', cubicleId: c.id, x: 0, y: 0, w: 3, h: 3 },
      ],
    }).expect(200);
  });

  it('does not check overlaps (OQ-T61-6) and an empty save leaves hasLayout false (OQ-T61-4)', async () => {
    await save({ version: 0, ...grid, elements: [] }).expect(200);
    expect((await a.get(`/api/owner/spaces/${spaceId}`)).body.hasLayout).toBe(false);
    await renter.get(`/api/listings/${spaceId}/layout`).expect(404);
    await save({
      version: 1,
      ...grid,
      elements: [
        { kind: 'area', label: 'A', x: 0, y: 0, w: 4, h: 4 },
        { kind: 'area', label: 'B', x: 1, y: 1, w: 4, h: 4 },
      ],
    }).expect(200);
  });

  it('validates the body (400) and unknown or foreign ids (404)', async () => {
    await save({ version: 0, columns: 5, rows: 30, elements: [] }).expect(400);
    await save({
      version: 0,
      ...grid,
      elements: [{ kind: 'area', x: 0, y: 0, w: 1, h: 1 }],
    }).expect(400);
    await save({
      version: 0,
      ...grid,
      elements: [
        { kind: 'seat', seatId: '00000000-0000-4000-8000-000000000000', x: 0, y: 0, w: 1, h: 1 },
      ],
    }).expect(404);
    const other = await createListing(db(), String((await b.get('/api/me')).body.id));
    const [foreign] = await createSeats(db(), other.id, 1);
    await save({
      version: 0,
      ...grid,
      elements: [{ kind: 'seat', seatId: foreign?.id, x: 0, y: 0, w: 1, h: 1 }],
    }).expect(404);
  });

  it('lists a newly added seat as unplaced and drops the element of a removed seat (AC 8.2)', async () => {
    const [s1, s2] = await createSeats(db(), spaceId, 2);
    await save({
      version: 0,
      ...grid,
      elements: [
        { kind: 'seat', seatId: s1?.id, x: 0, y: 0, w: 1, h: 1 },
        { kind: 'seat', seatId: s2?.id, x: 2, y: 0, w: 1, h: 1 },
      ],
    }).expect(200);
    const added = await a
      .post(`/api/owner/spaces/${spaceId}/seats`)
      .send({ seats: [{ label: 'New' }] })
      .expect(201);
    const newId = added.body.items[0].id;
    let res = await a.get(base).expect(200);
    expect(res.body.unplacedSeatIds).toEqual([newId]);
    await a.delete(`/api/owner/spaces/${spaceId}/seats/${s1?.id}`).expect(204);
    res = await a.get(base).expect(200);
    expect((res.body.elements as { seatId: string }[]).map((e) => e.seatId)).toEqual([s2?.id]);
  });

  it('drops the cubicle element and its seats elements when a cubicle is removed', async () => {
    const c = await createCubicle(db(), spaceId, { name: 'Pod 1' });
    await save({
      version: 0,
      ...grid,
      elements: [{ kind: 'cubicle', cubicleId: c.id, x: 0, y: 0, w: 3, h: 3 }],
    }).expect(200);
    await a.delete(`/api/owner/spaces/${spaceId}/cubicles/${c.id}`).expect(204);
    const res = await a.get(base).expect(200);
    expect(res.body.elements).toEqual([]);
  });

  it('404s for another owner, 403 for a renter, 401 signed out; renter 404 without a layout', async () => {
    await b.get(base).expect(404);
    await save({ version: 0, ...grid, elements: [] }, b).expect(404);
    await renter.get(base).expect(403);
    await renter.get(`/api/listings/${spaceId}/layout`).expect(404);
    await request(app.getHttpServer()).get(base).expect(401);
    await request(app.getHttpServer()).get(`/api/listings/${spaceId}/layout`).expect(401);
  });

  it('hides the layout of an unpublished space from renters', async () => {
    const [s] = await createSeats(db(), spaceId, 1);
    await save({
      version: 0,
      ...grid,
      elements: [{ kind: 'seat', seatId: s?.id, x: 0, y: 0, w: 1, h: 1 }],
    }).expect(200);
    await db().update(space).set({ status: 'unpublished' }).where(eq(space.id, spaceId));
    await renter.get(`/api/listings/${spaceId}/layout`).expect(404);
  });
});
