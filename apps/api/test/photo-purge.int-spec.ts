import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getQueueToken } from '@nestjs/bullmq';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';
import type { Queue } from 'bullmq';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { photoObjectPurge } from '../src/db/schema/index.js';
import { photoKeys } from '../src/photos/photo-keys.js';
import { PhotoPurgeService } from '../src/photos/photo-purge.service.js';
import { PHOTO_PURGE_QUEUE, PhotoPurgeScheduler } from '../src/photos/photo-purge.types.js';
import { StorageService } from '../src/storage/storage.service.js';
import { testDb } from './fixtures.js';
import { createTestApp, resetDb } from './helpers.js';

const bucket = process.env.S3_BUCKET_PHOTOS ?? 'bseat-photos-test';
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
});
const exists = async (key: string) =>
  s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key })).then(
    () => true,
    () => false,
  );
const put = (key: string) =>
  s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: Buffer.from('x') }));
const MIN = 60_000;

describe('photo purge sweep', () => {
  let app: NestExpressApplication;
  let sweeper: PhotoPurgeService;
  const db = () => testDb(app);

  async function seedRow(
    reason: 'deleted' | 'abandoned_upload',
    opts: { dueAgoMs?: number; lastAttemptAgoMs?: number; withObjects?: boolean } = {},
  ) {
    const spaceId = randomUUID();
    const photoId = randomUUID();
    const keys = photoKeys(spaceId, photoId);
    if (opts.withObjects !== false) await Promise.all([put(keys.card), put(keys.display)]);
    await db()
      .insert(photoObjectPurge)
      .values({
        spaceId,
        photoId,
        reason,
        dueAt: new Date(Date.now() - (opts.dueAgoMs ?? MIN)),
        lastAttemptAt:
          opts.lastAttemptAgoMs === undefined ? null : new Date(Date.now() - opts.lastAttemptAgoMs),
      });
    return { spaceId, photoId, keys };
  }
  const rowOf = async (photoId: string) =>
    (await db().select().from(photoObjectPurge).where(eq(photoObjectPurge.photoId, photoId)))[0];

  beforeAll(async () => {
    app = await createTestApp();
    sweeper = app.get(PhotoPurgeService);
  });
  beforeEach(async () => {
    await resetDb(app);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => app.close());

  it('deletes both objects and the row for a deleted photo (FR-010)', async () => {
    const r = await seedRow('deleted');
    await sweeper.sweep();
    expect(await exists(r.keys.card)).toBe(false);
    expect(await exists(r.keys.display)).toBe(false);
    expect(await rowOf(r.photoId)).toBeUndefined();
  });

  it('purges an abandoned intent once due and leaves one that is not due', async () => {
    const due = await seedRow('abandoned_upload');
    const notDue = await seedRow('abandoned_upload', { dueAgoMs: -MIN });
    await sweeper.sweep();
    expect(await exists(due.keys.card)).toBe(false);
    expect(await rowOf(due.photoId)).toBeUndefined();
    expect(await exists(notDue.keys.card)).toBe(true);
    expect(await rowOf(notDue.photoId)).toBeDefined();
  });

  it('succeeds when objects are already missing', async () => {
    const r = await seedRow('deleted', { withObjects: false });
    await sweeper.sweep();
    expect(await rowOf(r.photoId)).toBeUndefined();
  });

  it('keeps a failed row with attempts 1, skips it during the lease, then retries', async () => {
    const r = await seedRow('deleted');
    const spy = vi
      .spyOn(StorageService.prototype, 'deleteObject')
      .mockRejectedValueOnce(new Error('storage down'));
    await sweeper.sweep();
    const row = await rowOf(r.photoId);
    expect(row?.attempts).toBe(1);
    expect(row?.lastAttemptAt).not.toBeNull();

    spy.mockClear();
    await sweeper.sweep();
    expect(spy).not.toHaveBeenCalled();

    await db()
      .update(photoObjectPurge)
      .set({ lastAttemptAt: new Date(Date.now() - 11 * MIN) })
      .where(eq(photoObjectPurge.photoId, r.photoId));
    await sweeper.sweep();
    expect(await rowOf(r.photoId)).toBeUndefined();
    expect(await exists(r.keys.card)).toBe(false);
  });

  it('picks a crashed claim up again once its lease ends', async () => {
    const r = await seedRow('deleted', { lastAttemptAgoMs: 11 * MIN });
    await sweeper.sweep();
    expect(await rowOf(r.photoId)).toBeUndefined();
    const leased = await seedRow('deleted', { lastAttemptAgoMs: 2 * MIN });
    await sweeper.sweep();
    expect((await rowOf(leased.photoId))?.attempts).toBe(0);
  });

  it('logs photo.purge_overdue with ids only for rows past the overdue limit', async () => {
    const warn = vi.spyOn(PinoLogger.prototype, 'warn');
    const error = vi.spyOn(PinoLogger.prototype, 'error');
    const late = await seedRow('deleted', { dueAgoMs: 25 * 60 * MIN });
    const fine = await seedRow('deleted', { dueAgoMs: 60 * MIN });
    await sweeper.sweep();
    const calls = [...warn.mock.calls, ...error.mock.calls].filter(
      (c) => c[1] === 'photo.purge_overdue',
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toEqual({
      purgeId: expect.any(String),
      spaceId: late.spaceId,
      photoId: late.photoId,
    });
    expect(JSON.stringify(calls)).not.toContain(fine.photoId);
  });

  it('two concurrent sweeps delete each key once', async () => {
    const rows = await Promise.all(Array.from({ length: 12 }, () => seedRow('deleted')));
    const spy = vi.spyOn(StorageService.prototype, 'deleteObject');
    await Promise.all([sweeper.sweep(), sweeper.sweep()]);
    expect(spy).toHaveBeenCalledTimes(24);
    expect(new Set(spy.mock.calls.map((c) => c[0])).size).toBe(24);
    for (const r of rows) expect(await rowOf(r.photoId)).toBeUndefined();
  });

  it('a claimed intent makes the insert-transaction removal match nothing (T008 rule)', async () => {
    const r = await seedRow('abandoned_upload');
    await sweeper.sweep();
    const { rowCount } = await db().execute(
      sql`delete from photo_object_purge where photo_id = ${r.photoId} and reason = 'abandoned_upload' and last_attempt_at is null`,
    );
    expect(rowCount).toBe(0);
  });

  it('registers exactly one job scheduler however often the API boots', async () => {
    const queue = app.get<Queue>(getQueueToken(PHOTO_PURGE_QUEUE));
    const scheduler = app.get(PhotoPurgeScheduler);
    await scheduler.onApplicationBootstrap();
    await scheduler.onApplicationBootstrap();
    const schedulers = await queue.getJobSchedulers();
    expect(schedulers).toHaveLength(1);
    expect(schedulers[0]?.every).toBe(5 * MIN);
  });
});
