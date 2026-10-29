import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { ConfigService } from '@nestjs/config';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { Env } from '../config/env.js';
import { photoKeys } from '../photos/photo-keys.js';
import { processPhoto } from '../photos/photo-processing.js';
import { StorageService } from '../storage/storage.service.js';
import type { Database } from './db.js';
import { space, spacePhoto } from './schema/index.js';
import { SeedError } from './seed-error.js';
import { SEED_PHOTOS, type SeedPhoto } from './seed-photos/photos.js';

/** The one thing the seed needs from storage; `StorageService` satisfies it. */
export interface PhotoStore {
  putObject(key: string, body: Buffer, contentType: 'image/webp'): Promise<void>;
}

const PHOTO_DIR = fileURLToPath(new URL('./seed-photos/', import.meta.url));

const storageEnvSchema = z.object({
  S3_ENDPOINT: z.url().optional(),
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET_PHOTOS: z.string().min(3).default('bseat-photos'),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  PHOTO_URL_TTL_SECONDS: z.coerce.number().int().default(3600),
});

/** The seed does not call loadEnv, so it reads only the storage variables it needs. */
export function storageFromEnv(env: Record<string, string | undefined>): PhotoStore {
  const parsed = storageEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new SeedError(
      `seed: storage settings: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    );
  }
  // ConfigService only needs `get`; the seed has no Nest app to build one from.
  return new StorageService(new ConfigService<Env, true>(parsed.data));
}

/**
 * Gives each demo space with no photos its set (R-11), through the upload code path: sharp
 * processing, both variants into the bucket, then the rows. A space that has any photo is left
 * alone, so an owner's changes survive a re-run. Reads local files and talks only to storage
 * and Postgres (FR-025). Storage errors stop the seed with a clear message, and a re-run resumes.
 */
export async function seedPhotos(
  db: Database,
  store: PhotoStore,
  ownerId: string,
  photos: readonly SeedPhoto[] = SEED_PHOTOS,
): Promise<void> {
  const names = [...new Set(photos.map((p) => p.spaceName))];
  for (const name of names) {
    const [target] = await db
      .select({ id: space.id })
      .from(space)
      .where(and(eq(space.name, name), eq(space.ownerId, ownerId)))
      .limit(1);
    if (!target) continue;
    if (await hasPhotos(db, target.id)) continue;

    const set = [...photos.filter((p) => p.spaceName === name)].sort(
      (a, b) => a.position - b.position,
    );
    const prepared: { photo: SeedPhoto; id: string; width: number; height: number }[] = [];
    for (const photo of set) {
      const result = await processPhoto(await readFile(`${PHOTO_DIR}${photo.file}`));
      if (!result.ok)
        throw new SeedError(`seed: ${photo.file} is not a usable photo (${result.reason})`);
      const id = randomUUID();
      const keys = photoKeys(target.id, id);
      try {
        await Promise.all([
          store.putObject(keys.card, result.card, 'image/webp'),
          store.putObject(keys.display, result.display, 'image/webp'),
        ]);
      } catch {
        throw new SeedError(
          'seed: could not reach photo storage; start it (docker compose up storage storage-init) and re-run the seed',
        );
      }
      prepared.push({ photo, id, width: result.width, height: result.height });
    }

    await db.transaction(async (tx) => {
      // Same lock as an upload, so a photo added meanwhile wins and the seed adds nothing.
      await tx.select({ id: space.id }).from(space).where(eq(space.id, target.id)).for('update');
      if (await hasPhotos(tx, target.id)) return;
      await tx.insert(spacePhoto).values(
        prepared.map((p, i) => ({
          id: p.id,
          spaceId: target.id,
          position: i + 1,
          description: p.photo.description,
          displayWidth: p.width,
          displayHeight: p.height,
        })),
      );
    });
  }
}

async function hasPhotos(db: Pick<Database, 'select'>, spaceId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(spacePhoto)
    .where(eq(spacePhoto.spaceId, spaceId));
  return (row?.n ?? 0) > 0;
}
