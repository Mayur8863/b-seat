import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { signedInUser } from './fixtures.js';
import { createTestApp, resetDb } from './helpers.js';

describe('retired legacy spaces API (T043, R-7 step 6)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  it('GET /api/spaces and its availability read are 404 for a signed-in user', async () => {
    const { agent } = await signedInUser(app, 'reader@example.com');
    await agent.get('/api/spaces').expect(404);
    const res = await agent
      .get(
        '/api/spaces/00000000-0000-4000-8000-000000000000/availability?date=2030-01-07&startTime=09:00&endTime=10:00',
      )
      .expect(404);
    expect(res.body).toMatchObject({ type: 'urn:bseat:problem:http-404', status: 404 });
  });
});
