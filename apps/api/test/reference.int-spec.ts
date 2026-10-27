import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ReferenceSchema } from '../src/reference/reference.schemas.js';
import { createTestApp, resetDb, signedInAgent } from './helpers.js';

describe('GET /api/reference', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  it('returns countries, currencies and the 11 utilities to a signed-in user', async () => {
    const agent = await signedInAgent(app);
    const res = await agent.get('/api/reference').expect(200);
    const body = ReferenceSchema.parse(res.body);
    expect(body.countries).toContainEqual({
      code: 'IN',
      name: 'India',
      timeZones: expect.arrayContaining(['Asia/Kolkata']),
    });
    expect(body.countries.find((c) => c.code === 'GB')?.timeZones).toContain('Europe/London');
    expect(body.currencies.map((c) => c.code)).toEqual(expect.arrayContaining(['INR', 'GBP']));
    expect(body.utilities).toEqual([
      'wifi',
      'air_conditioning',
      'power_backup',
      'parking',
      'meeting_room',
      'tea_coffee',
      'printer',
      'lockers',
      'security_24h',
      'cafeteria',
      'accessible_entrance',
    ]);
    expect(res.headers['cache-control']).toBe('private, max-age=3600');
  });

  it('is 401 problem+json without a session', async () => {
    const res = await request(app.getHttpServer()).get('/api/reference').expect(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.headers['cache-control'] ?? '').not.toContain('max-age=3600');
  });
});
