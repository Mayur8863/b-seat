import { fileURLToPath } from 'node:url';

import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createDb, createPool } from '../src/db/db.js';

/** Creates the test photo bucket if needed and empties it, so every run starts clean. */
async function resetPhotoBucket(): Promise<void> {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) return;
  const Bucket = process.env.S3_BUCKET_PHOTOS_TEST ?? 'bseat-photos-test';
  const s3 = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  try {
    try {
      await s3.send(new HeadBucketCommand({ Bucket }));
    } catch {
      await s3.send(new CreateBucketCommand({ Bucket }));
    }
    let token: string | undefined;
    do {
      const page = await s3.send(
        new ListObjectsV2Command({ Bucket, ...(token ? { ContinuationToken: token } : {}) }),
      );
      for (const { Key } of page.Contents ?? []) {
        if (Key) await s3.send(new DeleteObjectCommand({ Bucket, Key }));
      }
      token = page.NextContinuationToken;
    } while (token);
  } finally {
    s3.destroy();
  }
}

/** Brings the test database schema up to date once per run. */
export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is required for integration tests');

  await resetPhotoBucket();

  const pool = createPool(url);
  try {
    await migrate(createDb(pool), {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}
