import { randomUUID } from 'node:crypto';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { PinoLogger } from 'nestjs-pino';
import pg from 'pg';

import { withLockTimeout } from '../bookings/seat-lock.js';
import {
  photoBusy,
  photoDimensionsOutOfRange,
  photoLimitReached,
  photoUnreadable,
  photoUnsupportedFormat,
} from '../common/errors/problem-types.js';
import { Clock } from '../common/time/clock.js';
import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.js';
import { photoObjectPurge, space, spacePhoto } from '../db/schema/index.js';
import { StorageService } from '../storage/storage.service.js';
import { photoKeys } from './photo-keys.js';
import { processPhoto, type PhotoRejection } from './photo-processing.js';
import {
  PHOTO_LIMIT,
  type DescribeSpacePhotoInput,
  type OwnerSpacePhoto,
  type OwnerSpacePhotos,
} from './space-photos.schemas.js';
import { PROCESSING_WAIT_MS, Semaphore } from './upload-limits.js';

const CARD = { width: 640, height: 480 } as const;

const REJECTIONS: Record<PhotoRejection, () => Error> = {
  'unsupported-format': photoUnsupportedFormat,
  unreadable: photoUnreadable,
  'dimensions-out-of-range': photoDimensionsOutOfRange,
};

function pgError(err: unknown): pg.DatabaseError | null {
  if (err instanceof DrizzleQueryError && err.cause instanceof pg.DatabaseError) return err.cause;
  return err instanceof pg.DatabaseError ? err : null;
}

/** Sentinel for "the intent was not ours to delete": the sweep claimed it first. */
class IntentLostError extends Error {}

@Injectable()
export class SpacePhotosService {
  private readonly processing = new Semaphore();

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
    private readonly clock: Clock,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SpacePhotosService.name);
  }

  /**
   * ADR-0011 section 2 order: process, record an upload intent, put both objects, then one
   * transaction (lock the owned space row, count, consume the intent, insert). Any failure after the
   * intent makes it due at once; the purge sweep is the only thing that deletes objects.
   */
  async add(ownerId: string, spaceId: string, bytes: Buffer): Promise<OwnerSpacePhoto> {
    const started = Date.now();
    const result = await this.process(spaceId, bytes);
    if (!result.ok) {
      const problem = REJECTIONS[result.reason]();
      this.logger.info({ spaceId, reason: result.reason, bytesIn: bytes.length }, 'photo.rejected');
      throw problem;
    }

    const photoId = randomUUID();
    const keys = photoKeys(spaceId, photoId);
    await this.db.insert(photoObjectPurge).values({
      spaceId,
      photoId,
      reason: 'abandoned_upload',
      dueAt: sql`now() + interval '1 hour'`,
    });

    try {
      try {
        await Promise.all([
          this.storage.putObject(keys.card, result.card, 'image/webp'),
          this.storage.putObject(keys.display, result.display, 'image/webp'),
        ]);
      } catch (err) {
        this.logger.warn({ spaceId, photoId, err }, 'photo.storage_unavailable');
        throw photoBusy();
      }

      const row = await this.insertPhoto(ownerId, spaceId, photoId, result.width, result.height);
      const { urls } = await this.storage.signGetUrls([keys.card, keys.display], this.clock.now());
      this.logger.info(
        {
          spaceId,
          photoId,
          format: result.format,
          width: result.width,
          height: result.height,
          bytesIn: bytes.length,
          bytesStored: result.card.length + result.display.length,
          ms: Date.now() - started,
        },
        'photo.added',
      );
      return {
        id: photoId,
        position: row.position,
        description: null,
        altText: `${row.spaceName} photo ${row.position}`,
        card: { url: urls[0] ?? '', ...CARD },
        display: { url: urls[1] ?? '', width: result.width, height: result.height },
        createdAt: row.createdAt.toISOString(),
      };
    } catch (err) {
      await this.dueNow(photoId);
      this.logger.info(
        { spaceId, reason: err instanceof Error ? err.name : 'unknown', bytesIn: bytes.length },
        'photo.rejected',
      );
      throw err;
    }
  }

  async list(ownerId: string, spaceId: string): Promise<OwnerSpacePhotos> {
    const [owned] = await this.db
      .select({ name: space.name })
      .from(space)
      .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)));
    if (!owned) throw new NotFoundException();
    const rows = await this.db
      .select()
      .from(spacePhoto)
      .where(eq(spacePhoto.spaceId, spaceId))
      .orderBy(asc(spacePhoto.position));
    return this.present(owned.name, rows);
  }

  async describe(
    ownerId: string,
    spaceId: string,
    photoId: string,
    input: DescribeSpacePhotoInput,
  ): Promise<OwnerSpacePhoto> {
    const description =
      input.description === null || input.description === '' ? null : input.description;
    const { name, row } = await this.db.transaction(async (tx) => {
      const [locked] = await withLockTimeout(tx, this.logger, { spaceId }, () =>
        tx
          .select({ name: space.name })
          .from(space)
          .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)))
          .for('update', { of: space }),
      );
      if (!locked) throw new NotFoundException();
      const [updated] = await tx
        .update(spacePhoto)
        .set({ description, updatedAt: sql`now()` })
        .where(and(eq(spacePhoto.id, photoId), eq(spacePhoto.spaceId, spaceId)))
        .returning();
      if (!updated) throw new NotFoundException();
      return { name: locked.name, row: updated };
    });
    this.logger.info({ spaceId, photoId }, 'photo.described');
    const [item] = (await this.present(name, [row])).items;
    if (!item) throw new NotFoundException();
    return item;
  }

  /** One `now` and one signing call per response, so every URL shares a window. */
  private async present(
    spaceName: string,
    rows: (typeof spacePhoto.$inferSelect)[],
  ): Promise<OwnerSpacePhotos> {
    const keys = rows.flatMap((r) => {
      const k = photoKeys(r.spaceId, r.id);
      return [k.card, k.display];
    });
    const { urls, expiresAt } = await this.storage.signGetUrls(keys, this.clock.now());
    return {
      items: rows.map((r, i) => ({
        id: r.id,
        position: r.position,
        description: r.description,
        altText: r.description ?? `${spaceName} photo ${r.position}`,
        card: { url: urls[i * 2] ?? '', ...CARD },
        display: { url: urls[i * 2 + 1] ?? '', width: r.displayWidth, height: r.displayHeight },
        createdAt: r.createdAt.toISOString(),
      })),
      limit: PHOTO_LIMIT,
      photoUrlsExpireAt: rows.length > 0 ? expiresAt.toISOString() : null,
    };
  }

  private async process(spaceId: string, bytes: Buffer) {
    let release: () => void;
    try {
      release = await this.processing.acquire(PROCESSING_WAIT_MS);
    } catch {
      this.logger.warn({ spaceId }, 'photo.processing_wait_exceeded');
      throw photoBusy();
    }
    try {
      return await processPhoto(bytes);
    } finally {
      release();
    }
  }

  private async insertPhoto(
    ownerId: string,
    spaceId: string,
    photoId: string,
    width: number,
    height: number,
  ): Promise<{ position: number; createdAt: Date; spaceName: string }> {
    try {
      return await this.db.transaction(async (tx) => {
        // Authorization and serialisation in one statement: a foreign space is a 404 (ADR-0011 section 8).
        const [locked] = await withLockTimeout(tx, this.logger, { spaceId }, () =>
          tx
            .select({ name: space.name })
            .from(space)
            .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)))
            .for('update', { of: space }),
        );
        if (!locked) throw new NotFoundException();

        const [counted] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(spacePhoto)
          .where(eq(spacePhoto.spaceId, spaceId));
        const count = counted?.n ?? 0;
        if (count >= PHOTO_LIMIT) throw photoLimitReached();

        // Exactly one unclaimed intent, or the sweep already owns these objects.
        const consumed = await tx
          .delete(photoObjectPurge)
          .where(
            and(
              eq(photoObjectPurge.photoId, photoId),
              eq(photoObjectPurge.reason, 'abandoned_upload'),
              sql`${photoObjectPurge.lastAttemptAt} is null`,
            ),
          )
          .returning({ id: photoObjectPurge.id });
        if (consumed.length !== 1) throw new IntentLostError();

        const [inserted] = await tx
          .insert(spacePhoto)
          .values({
            id: photoId,
            spaceId,
            position: count + 1,
            displayWidth: width,
            displayHeight: height,
          })
          .returning({ position: spacePhoto.position, createdAt: spacePhoto.createdAt });
        if (!inserted) throw new IntentLostError();
        return { ...inserted, spaceName: locked.name };
      });
    } catch (err) {
      if (err instanceof IntentLostError) {
        this.logger.warn({ spaceId, photoId }, 'photo.intent_claimed');
        throw photoBusy();
      }
      const code = pgError(err);
      if (code?.code === '23514' && code.constraint === 'space_photo_position_range') {
        throw photoLimitReached();
      }
      if (code?.code === '23505' && code.constraint === 'space_photo_position_unique') {
        // Under the space lock this can only be a service bug, so it stays a 500.
        this.logger.error({ spaceId, photoId }, 'photo.position_conflict');
      }
      throw err;
    }
  }

  /** Makes the intent due now so the next sweep removes whatever was written. */
  private async dueNow(photoId: string): Promise<void> {
    try {
      await this.db
        .update(photoObjectPurge)
        .set({ dueAt: sql`now()` })
        .where(eq(photoObjectPurge.photoId, photoId));
    } catch (err) {
      // The intent is already due in at most an hour, so this only delays the purge.
      this.logger.error({ photoId, err }, 'photo.intent_update_failed');
    }
  }
}
