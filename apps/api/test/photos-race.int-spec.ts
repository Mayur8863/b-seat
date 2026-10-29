import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';
import pg from 'pg';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { photoObjectPurge, spacePhoto } from '../src/db/schema/index.js';
import { Semaphore } from '../src/photos/upload-limits.js';
import { createListing, testDb } from './fixtures.js';
import { createTestApp, resetDb, signedInAgent } from './helpers.js';

const pw = 'correct-horse-battery';

describe('10-photo limit under concurrency (SC-006)', () => {
  let app: NestExpressApplication;
  let owner: Awaited<ReturnType<typeof signedInAgent>>;
  let ownerId: string;
  let spaceId: string;
  let jpeg: Buffer;

  const db = () => testDb(app);
  const url = () => `/api/owner/spaces/${spaceId}/photos`;
  const upload = () =>
    owner.post(url()).attach('file', jpeg, { filename: 'x.jpg', contentType: 'image/jpeg' });

  beforeAll(async () => {
    app = await createTestApp();
    jpeg = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: { r: 10, g: 90, b: 30 } },
    })
      .jpeg()
      .toBuffer();
  });
  beforeEach(async () => {
    await resetDb(app);
    owner = await signedInAgent(app, { name: 'A', email: 'a@example.com', password: pw }, 'owner');
    ownerId = String((await owner.get('/api/me')).body.id);
    spaceId = (await createListing(db(), ownerId, { name: 'London HQ' })).id;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => app.close());

  it.each(Array.from({ length: 10 }, (_, i) => i + 1))(
    'round %i: 15 simultaneous uploads give exactly 10 photos at positions 1..10',
    async () => {
      // A round starts from an empty space.
      await db().delete(spacePhoto).where(eq(spacePhoto.spaceId, spaceId));
      await db().delete(photoObjectPurge);

      const results = await Promise.all(Array.from({ length: 15 }, () => upload()));
      const statuses = results.map((r) => r.status);
      expect(statuses.filter((s) => s === 201)).toHaveLength(10);
      expect(statuses.filter((s) => s === 409)).toHaveLength(5);
      for (const r of results.filter((x) => x.status === 409)) {
        expect(r.body.type).toBe('urn:bseat:problem:photo:limit-reached');
        expect(r.body.limit).toBe(10);
      }

      const rows = await db().select().from(spacePhoto).where(eq(spacePhoto.spaceId, spaceId));
      expect(rows.map((r) => r.position).sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
      ]);

      // Each loser left an intent that is due now, so one sweep removes its objects.
      const purges = await db().select().from(photoObjectPurge);
      expect(purges).toHaveLength(5);
      for (const p of purges) expect(p.dueAt.getTime()).toBeLessThanOrEqual(Date.now());
      const kept = new Set(rows.map((r) => r.id));
      for (const p of purges) expect(kept.has(p.photoId)).toBe(false);
    },
    60_000,
  );

  it('503 photo:busy with Retry-After when the processing semaphore wait is exceeded', async () => {
    vi.spyOn(Semaphore.prototype, 'acquire').mockRejectedValue(new Error('timed out'));
    const res = await upload();
    expect(res.status).toBe(503);
    expect(res.body.type).toBe('urn:bseat:problem:photo:busy');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('logs photo.lock_timeout at warn with ids only and fails with 500 on a lock wait timeout', async () => {
    const warn = vi.spyOn(PinoLogger.prototype, 'warn');
    const holder = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await holder.connect();
    await holder.query('begin');
    await holder.query('select 1 from space where id = $1 for update', [spaceId]);
    try {
      const res = await upload();
      expect(res.status).toBe(500);
    } finally {
      await holder.query('rollback');
      await holder.end();
    }
    const call = warn.mock.calls.find((c) => c[1] === 'photo.lock_timeout');
    expect(call?.[0]).toEqual({ spaceId });
    const rows = await db().select().from(photoObjectPurge);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dueAt.getTime()).toBeLessThanOrEqual(Date.now());
  }, 30_000);
});
