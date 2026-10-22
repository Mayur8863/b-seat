import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, resetDb, signedInAgent } from './helpers.js';

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
    });
  });

  it('is 401 problem+json when signed out', async () => {
    const res = await request(app.getHttpServer()).get('/api/me').expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });
});
