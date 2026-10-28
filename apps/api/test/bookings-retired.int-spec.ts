import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { signedInUser } from './fixtures.js';
import { createTestApp, resetDb } from './helpers.js';

describe('retired hourly create (T008, R-7)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  it('POST /api/bookings is 404, signed in or not (the route no longer exists)', async () => {
    const { agent } = await signedInUser(app, 'booker@example.com');
    const body = {
      seatId: '00000000-0000-4000-8000-000000000000',
      date: '2026-10-23',
      startTime: '09:00',
      endTime: '10:00',
    };

    const signedIn = await agent.post('/api/bookings').send(body).expect(404);
    const anonymous = await request(app.getHttpServer()).post('/api/bookings').send(body);

    expect(signedIn.body).toMatchObject({ type: 'urn:bseat:problem:http-404', status: 404 });
    expect(anonymous.status).toBe(404);
  });
});
