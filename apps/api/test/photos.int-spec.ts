import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { photoObjectPurge, spacePhoto } from '../src/db/schema/index.js';
import { uploadAdmission } from '../src/photos/upload-admission.guard.js';
import { uploadStorage } from '../src/photos/upload-storage.js';
import { StorageService } from '../src/storage/storage.service.js';
import { createListing, testDb } from './fixtures.js';
import { ORIGIN, createTestApp, resetDb, signedInAgent } from './helpers.js';

const pw = 'correct-horse-battery';

const GPS_EXIF = {
  IFD0: { Artist: 'Camera Owner Jane' },
  IFD3: {
    GPSLatitudeRef: 'N',
    GPSLatitude: '51/1 30/1 0/1',
    GPSLongitudeRef: 'W',
    GPSLongitude: '0/1 7/1 0/1',
  },
};

const image = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 90, b: 30 } } });

describe('space photo upload API', () => {
  let app: NestExpressApplication;
  let owner: Awaited<ReturnType<typeof signedInAgent>>;
  let ownerId: string;
  let other: Awaited<ReturnType<typeof signedInAgent>>;
  let renter: Awaited<ReturnType<typeof signedInAgent>>;
  let spaceId: string;
  let jpeg: Buffer;

  const db = () => testDb(app);
  const url = (id = spaceId) => `/api/owner/spaces/${id}/photos`;
  const upload = (bytes: Buffer, id = spaceId, agent = owner) =>
    agent.post(url(id)).attach('file', bytes, { filename: 'x.jpg', contentType: 'image/jpeg' });
  const photos = () => db().select().from(spacePhoto).where(eq(spacePhoto.spaceId, spaceId));
  const purges = () => db().select().from(photoObjectPurge);

  beforeAll(async () => {
    app = await createTestApp();
    jpeg = await image(1200, 900).jpeg().toBuffer();
  });
  beforeEach(async () => {
    await resetDb(app);
    owner = await signedInAgent(app, { name: 'A', email: 'a@example.com', password: pw }, 'owner');
    ownerId = String((await owner.get('/api/me')).body.id);
    other = await signedInAgent(app, { name: 'B', email: 'b@example.com', password: pw }, 'owner');
    renter = await signedInAgent(app, { name: 'R', email: 'r@example.com', password: pw });
    spaceId = (await createListing(db(), ownerId, { name: 'London HQ' })).id;
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(() => app.close());

  it.each(['jpeg', 'png', 'webp'] as const)(
    'accepts a %s at position n + 1, stores both objects and leaves no purge row',
    async (format) => {
      const bytes = await image(1200, 900).toFormat(format).toBuffer();
      const first = await upload(bytes);
      expect(first.status).toBe(201);
      expect(first.body).toMatchObject({
        position: 1,
        description: null,
        altText: 'London HQ photo 1',
        card: { width: 640, height: 480 },
        display: { width: 1200, height: 900 },
      });
      const second = await upload(bytes);
      expect(second.body.position).toBe(2);

      for (const variant of [first.body.card, first.body.display] as { url: string }[]) {
        const res = await fetch(variant.url);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/webp');
      }
      expect(await photos()).toHaveLength(2);
      expect(await purges()).toHaveLength(0);
    },
  );

  it('strips GPS and applies orientation 6 in the stored display (FR-013, FR-014)', async () => {
    const tagged = await image(2000, 1500)
      .withExif(GPS_EXIF)
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const res = await upload(tagged);
    expect(res.status).toBe(201);
    const stored = Buffer.from(
      await (await fetch((res.body.display as { url: string }).url)).arrayBuffer(),
    );
    const meta = await sharp(stored).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(meta.height).toBeGreaterThan(meta.width);
  });

  describe('rejections leave nothing behind', () => {
    const none = async () => {
      expect(await photos()).toHaveLength(0);
      expect(await purges()).toHaveLength(0);
    };

    it('413 for an 11 MiB file', async () => {
      const big = Buffer.concat([jpeg.subarray(0, 3), Buffer.alloc(11 * 1024 * 1024)]);
      const res = await upload(big);
      expect(res.status).toBe(413);
      expect(res.body).toMatchObject({
        type: 'urn:bseat:problem:photo:too-large',
        maxBytes: 10_485_760,
      });
      await none();
    });

    it('415 for a GIF', async () => {
      const gif = await image(1200, 900).gif().toBuffer();
      const res = await upload(gif);
      expect(res.status).toBe(415);
      expect(res.body.type).toBe('urn:bseat:problem:photo:unsupported-format');
      await none();
    });

    it('422 for a 700 px image', async () => {
      const res = await upload(await image(700, 700).jpeg().toBuffer());
      expect(res.status).toBe(422);
      expect(res.body.type).toBe('urn:bseat:problem:photo:dimensions-out-of-range');
      await none();
    });

    it('422 for corrupt bytes', async () => {
      const res = await upload(Buffer.concat([jpeg.subarray(0, 200), Buffer.alloc(300, 7)]));
      expect(res.status).toBe(422);
      expect(res.body.type).toBe('urn:bseat:problem:photo:unreadable');
      await none();
    });

    it('400 with no file part and with an extra field', async () => {
      const empty = await owner.post(url()).field('a', 'b');
      expect(empty.status).toBe(400);
      const extra = await owner.post(url()).field('a', 'b').attach('file', jpeg, 'x.jpg');
      expect(extra.status).toBe(400);
      const json = await owner.post(url()).send({});
      expect(json.status).toBe(400);
      await none();
    });

    it('400 for a malformed space id', async () => {
      expect((await upload(jpeg, 'nope')).status).toBe(400);
    });
  });

  describe('authorization', () => {
    it('404s another owner and a random id with the same body, and frees the intent', async () => {
      const foreign = await upload(jpeg, spaceId, other);
      const random = await upload(jpeg, randomUUID());
      expect(foreign.status).toBe(404);
      expect(random.status).toBe(404);
      expect({ ...foreign.body, instance: '', requestId: '' }).toEqual({
        ...random.body,
        instance: '',
        requestId: '',
      });
      expect(await photos()).toHaveLength(0);
      for (const row of await purges()) expect(row.dueAt.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('403s a renter and a foreign Origin; 401s without a session', async () => {
      expect((await upload(jpeg, spaceId, renter)).status).toBe(403);
      const foreignOrigin = await upload(jpeg).set('origin', 'https://evil.example');
      expect(foreignOrigin.status).toBe(403);
      const anon = await request(app.getHttpServer())
        .post(url())
        .set('origin', ORIGIN)
        .attach('file', jpeg, 'x.jpg');
      expect(anon.status).toBe(401);
    });

    it('never reads a 10 MiB body for a rejected caller', async () => {
      const handle = vi.spyOn(uploadStorage, '_handleFile');
      const big = Buffer.alloc(10 * 1024 * 1024, 1);
      const anon = await request(app.getHttpServer())
        .post(url())
        .attach('file', big, 'x.jpg')
        .ok(() => true);
      expect(anon.status).toBe(401);
      expect((await upload(big, spaceId, renter).ok(() => true)).status).toBe(403);
      expect(
        (
          await upload(big)
            .set('origin', 'https://evil.example')
            .ok(() => true)
        ).status,
      ).toBe(403);
      expect(handle).not.toHaveBeenCalled();
    });
  });

  it('allows a draft space (FR-001)', async () => {
    expect((await upload(jpeg)).status).toBe(201);
  });

  it('409 photo:limit-reached at 10 with no row added and the intent due now', async () => {
    for (let i = 0; i < 10; i += 1) {
      await db()
        .insert(spacePhoto)
        .values({ spaceId, position: i + 1, displayWidth: 1200, displayHeight: 900 });
    }
    const res = await upload(jpeg);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ type: 'urn:bseat:problem:photo:limit-reached', limit: 10 });
    expect(await photos()).toHaveLength(10);
    const rows = await purges();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe('abandoned_upload');
    expect(rows[0]?.dueAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('503 photo:busy with Retry-After when storage is unreachable', async () => {
    vi.spyOn(app.get(StorageService), 'putObject').mockRejectedValue(new Error('down'));
    const res = await upload(jpeg);
    expect(res.status).toBe(503);
    expect(res.body.type).toBe('urn:bseat:problem:photo:busy');
    expect(res.headers['retry-after']).toBeDefined();
    expect(await photos()).toHaveLength(0);
    const rows = await purges();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dueAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('503 at once for the 17th upload in flight', async () => {
    const held = Array.from({ length: 16 }, () => uploadAdmission.tryEnter());
    try {
      const res = await upload(jpeg);
      expect(res.status).toBe(503);
      expect(res.body.type).toBe('urn:bseat:problem:photo:busy');
      expect(res.headers['retry-after']).toBeDefined();
    } finally {
      for (const release of held) release?.();
    }
    expect(uploadAdmission.inFlight).toBe(0);
    expect((await upload(jpeg)).status).toBe(201);
  });

  it('rolls back with 503 when the sweep already claimed the intent', async () => {
    const storage = app.get(StorageService);
    const put = storage.putObject.bind(storage);
    vi.spyOn(storage, 'putObject').mockImplementation(async (...args) => {
      await put(...args);
      await db().update(photoObjectPurge).set({ lastAttemptAt: new Date(), attempts: 1 });
    });
    const res = await upload(jpeg);
    expect(res.status).toBe(503);
    expect(res.body.type).toBe('urn:bseat:problem:photo:busy');
    expect(await photos()).toHaveLength(0);
  });

  it('sets the 120 s request timeout (ADR-0011 section 2)', () => {
    expect(app.getHttpServer().requestTimeout).toBe(120_000);
  });
});
