import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestApp, ORIGIN, resetDb, signedInAgent } from './helpers.js';

describe('auth (Better Auth mounted at /api/auth)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  it('signs up and returns a session for the cookie', async () => {
    const agent = await signedInAgent(app, {
      name: 'Ada',
      email: 'ada@example.com',
      password: 'correct-horse-battery',
    });

    const res = await agent.get('/api/auth/get-session').set('origin', ORIGIN).expect(200);
    expect(res.body.user.email).toBe('ada@example.com');
  });

  it('rejects passwords shorter than 12 characters', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('origin', ORIGIN)
      .send({ name: 'Bob', email: 'bob@example.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('has no session without a cookie', async () => {
    const res = await request(app.getHttpServer()).get('/api/auth/get-session').expect(200);
    expect(res.body).toBeNull();
  });
});
