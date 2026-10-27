import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, ORIGIN, resetDb, signedInAgent } from './helpers.js';

describe('GET /api/me', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  it('returns the signed-in user', async () => {
    const agent = await signedInAgent(app, {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'correct-horse-battery',
    });
    const res = await agent.get('/api/me').expect(200);
    expect(res.body).toEqual({
      id: expect.any(String),
      name: 'Ada',
      email: 'ada@example.com',
      emailVerified: false,
      accountType: 'renter',
      preferences: null,
    });
  });

  it('is 401 problem+json when signed out', async () => {
    const res = await request(app.getHttpServer()).get('/api/me').expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });
});

describe('PUT /api/me/preferences', () => {
  let app: NestExpressApplication;
  const ada = { name: 'Ada', email: 'ada@example.com', password: 'correct-horse-battery' };

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  it('saves trimmed preferences and GET /api/me returns them', async () => {
    const agent = await signedInAgent(app, ada);
    const put = await agent
      .put('/api/me/preferences')
      .set('origin', ORIGIN)
      .send({ country: 'IN', city: ' Pune ', area: null })
      .expect(200);
    expect(put.body).toEqual({ country: 'IN', city: 'Pune', area: null });
    const me = await agent.get('/api/me').expect(200);
    expect(me.body.preferences).toEqual({ country: 'IN', city: 'Pune', area: null });
  });

  it('trims a padded area and accepts the length boundaries', async () => {
    const agent = await signedInAgent(app, ada);
    const res = await agent
      .put('/api/me/preferences')
      .set('origin', ORIGIN)
      .send({ country: 'IN', city: 'a'.repeat(100), area: '  Baner  ' })
      .expect(200);
    expect(res.body).toEqual({ country: 'IN', city: 'a'.repeat(100), area: 'Baner' });
    const one = await agent
      .put('/api/me/preferences')
      .set('origin', ORIGIN)
      .send({ country: 'IN', city: 'a'.repeat(100), area: 'a' })
      .expect(200);
    expect(one.body.area).toBe('a');
  });

  it('upserts and clears with all nulls', async () => {
    const agent = await signedInAgent(app, ada);
    await agent
      .put('/api/me/preferences')
      .set('origin', ORIGIN)
      .send({ country: 'IN', city: 'Pune', area: 'Baner' })
      .expect(200);
    await agent
      .put('/api/me/preferences')
      .set('origin', ORIGIN)
      .send({ country: 'GB', city: 'London', area: null })
      .expect(200);
    const cleared = await agent
      .put('/api/me/preferences')
      .set('origin', ORIGIN)
      .send({ country: null, city: null, area: null })
      .expect(200);
    expect(cleared.body).toEqual({ country: null, city: null, area: null });
    const me = await agent.get('/api/me').expect(200);
    expect(me.body.preferences).toEqual({ country: null, city: null, area: null });
  });

  it('keeps preferences per user', async () => {
    const a = await signedInAgent(app, ada);
    const b = await signedInAgent(app, { ...ada, name: 'Bo', email: 'bo@example.com' });
    await a
      .put('/api/me/preferences')
      .set('origin', ORIGIN)
      .send({ country: 'IN', city: 'Pune', area: null })
      .expect(200);
    expect((await b.get('/api/me').expect(200)).body.preferences).toBeNull();
  });

  it.each([
    ['unknown country', { country: 'XX', city: null, area: null }],
    ['lowercase country', { country: 'in', city: null, area: null }],
    ['101-char city', { country: null, city: 'a'.repeat(101), area: null }],
    ['blank city', { country: null, city: '   ', area: null }],
    ['control character in city', { country: null, city: 'a\u0000', area: null }],
    ['bidi override in area', { country: null, city: null, area: 'a\u202eb' }],
    ['101-char area', { country: null, city: null, area: 'a'.repeat(101) }],
    ['missing field', { country: 'IN', city: 'Pune' }],
    ['extra field', { country: 'IN', city: null, area: null, role: 'owner' }],
  ])('is 400 for %s', async (_name, body) => {
    const agent = await signedInAgent(app, ada);
    const res = await agent.put('/api/me/preferences').set('origin', ORIGIN).send(body).expect(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('is 403 for an owner and stores nothing', async () => {
    const agent = await signedInAgent(app, ada, 'owner');
    const res = await agent
      .put('/api/me/preferences')
      .set('origin', ORIGIN)
      .send({ country: 'IN', city: 'Pune', area: null })
      .expect(403);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.type).toBe('urn:bseat:problem:http-403');
    expect((await agent.get('/api/me').expect(200)).body.preferences).toBeNull();
  });

  it('is 401 when signed out', async () => {
    const res = await request(app.getHttpServer())
      .put('/api/me/preferences')
      .send({ country: null, city: null, area: null })
      .expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });
});
