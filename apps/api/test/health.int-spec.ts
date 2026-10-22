import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp } from './helpers.js';

describe('health + errors', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('reports live', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200, { status: 'ok' });
  });

  it('reports ready when Postgres and Redis are up', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body.info).toMatchObject({ postgres: { status: 'up' }, redis: { status: 'up' } });
  });

  it('returns RFC 9457 problem details for unknown routes', async () => {
    const res = await request(app.getHttpServer()).get('/does-not-exist').expect(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 404, type: 'urn:bseat:problem:http-404' });
    expect(res.body.requestId).toBeTypeOf('string');
  });
});
