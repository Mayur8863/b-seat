import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { signedInUser } from './fixtures.js';
import { createTestApp, ORIGIN, resetDb } from './helpers.js';

describe('cross-site write guard', () => {
  let app: NestExpressApplication;
  let agent: Awaited<ReturnType<typeof signedInUser>>['agent'];
  const cancel = () => agent.post(`/api/bookings/${randomUUID()}/cancel`);

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(app);
    ({ agent } = await signedInUser(app, 'csrf@example.com'));
  });
  afterAll(() => app.close());

  it('refuses a cross-site body-less POST with a 403 problem', async () => {
    const res = await cancel().set('Sec-Fetch-Site', 'cross-site').expect(403);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('refuses an untrusted Origin', async () => {
    await cancel().set('Origin', 'https://evil.test').expect(403);
  });

  it('lets same-origin browser requests, the trusted Origin and header-less callers through', async () => {
    // Past the guard, an unknown booking is a 404.
    await cancel().set('Sec-Fetch-Site', 'same-origin').set('Origin', ORIGIN).expect(404);
    await cancel().set('Sec-Fetch-Site', 'same-site').expect(404);
    await cancel().expect(404);
  });

  it('does not touch reads or Better Auth', async () => {
    await agent.get('/api/bookings').set('Sec-Fetch-Site', 'cross-site').expect(200);
  });
});
