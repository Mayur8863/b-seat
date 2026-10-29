import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it } from 'vitest';

import type { Env } from '../src/config/env.js';
import { StorageService } from '../src/storage/storage.service.js';

const bucket = process.env.S3_BUCKET_PHOTOS ?? 'bseat-photos-test';
const endpoint = process.env.S3_ENDPOINT ?? 'http://storage:9000';

function service(overrides: Record<string, unknown> = {}): StorageService {
  const values: Record<string, unknown> = {
    S3_ENDPOINT: endpoint,
    S3_PUBLIC_ENDPOINT: endpoint,
    S3_REGION: 'us-east-1',
    S3_BUCKET_PHOTOS: bucket,
    S3_FORCE_PATH_STYLE: true,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    PHOTO_URL_TTL_SECONDS: 3600,
    ...overrides,
  };
  const config = { get: (k: string) => values[k] } as unknown as ConfigService<Env, true>;
  return new StorageService(config);
}

const s3 = new S3Client({
  endpoint,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
  },
});

async function exists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

const body = Buffer.from('not really a webp, storage does not care');
let counter = 0;
const newKey = () => `spaces/test/${Date.now()}-${counter++}/card.webp`;

describe('StorageService (real S3-compatible server)', () => {
  const keys: string[] = [];
  afterEach(async () => {
    const storage = service();
    await Promise.all(keys.splice(0).map((k) => storage.deleteObject(k)));
  });

  it('serves a signed URL with webp type, private cache and Expires equal to the URL expiry', async () => {
    const storage = service();
    const key = newKey();
    keys.push(key);
    await storage.putObject(key, body, 'image/webp');

    const { urls, expiresAt } = await storage.signGetUrls([key], new Date());
    const res = await fetch(urls[0] ?? '');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('private');
    expect(new Date(res.headers.get('expires') ?? '').getTime()).toBe(expiresAt.getTime());
    expect(Buffer.from(await res.arrayBuffer()).equals(body)).toBe(true);
  });

  it('refuses a tampered signature', async () => {
    const storage = service();
    const key = newKey();
    keys.push(key);
    await storage.putObject(key, body, 'image/webp');
    const { urls } = await storage.signGetUrls([key], new Date());
    const url = new URL(urls[0] ?? '');
    const sig = url.searchParams.get('X-Amz-Signature') ?? '';
    url.searchParams.set('X-Amz-Signature', `${sig.slice(0, -1)}${sig.endsWith('0') ? '1' : '0'}`);
    expect((await fetch(url)).status).toBe(403);
  });

  it('stops serving after expiry (TTL 2 s)', async () => {
    const storage = service({ PHOTO_URL_TTL_SECONDS: 2 });
    const key = newKey();
    keys.push(key);
    await storage.putObject(key, body, 'image/webp');
    const { urls, expiresAt } = await storage.signGetUrls([key], new Date());
    expect((await fetch(urls[0] ?? '')).status).toBe(200);
    await new Promise((r) => setTimeout(r, Math.max(0, expiresAt.getTime() - Date.now()) + 1500));
    expect((await fetch(urls[0] ?? '')).status).toBe(403);
  }, 15_000);

  it('returns the same URLs within a window', async () => {
    const storage = service();
    const now = new Date(1_700_000_000_000);
    const a = await storage.signGetUrls(['spaces/x/y/card.webp'], now);
    const b = await storage.signGetUrls(['spaces/x/y/card.webp'], new Date(now.getTime() + 60_000));
    expect(a.urls).toEqual(b.urls);
    expect(a.expiresAt).toEqual(b.expiresAt);
  });

  it('deletes an existing key and treats a missing key as success', async () => {
    const storage = service();
    const key = newKey();
    await storage.putObject(key, body, 'image/webp');
    expect(await exists(key)).toBe(true);
    await storage.deleteObject(key);
    expect(await exists(key)).toBe(false);
    await expect(storage.deleteObject(key)).resolves.toBeUndefined();
  });

  it('signs with the public host while put and delete use the internal one', async () => {
    const storage = service({ S3_PUBLIC_ENDPOINT: 'http://localhost:9000' });
    const { urls } = await storage.signGetUrls(['spaces/a/b/card.webp'], new Date());
    expect(new URL(urls[0] ?? '').origin).toBe('http://localhost:9000');
    const key = newKey();
    await storage.putObject(key, body, 'image/webp');
    await storage.deleteObject(key);
    expect(await exists(key)).toBe(false);
  });
});
