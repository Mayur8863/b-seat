import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';

import { DB } from '../db/db.module.js';
import type { Database } from '../db/db.js';
import { photoObjectPurge } from '../db/schema/index.js';
import { StorageService } from '../storage/storage.service.js';
import { photoKeys } from './photo-keys.js';

const BATCH_SIZE = 100;
const LEASE_MINUTES = 10;
/** FR-010 allows 24 h; alert at half of that so an owner is never left past it. */
const OVERDUE_HOURS = 12;

interface Claimed {
  id: string;
  spaceId: string;
  photoId: string;
  overdue: boolean;
}

@Injectable()
export class PhotoPurgeService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly storage: StorageService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PhotoPurgeService.name);
  }

  /** Repeats while full batches remain. Failed rows are leased, so they cannot spin this loop. */
  async sweep(): Promise<void> {
    for (;;) {
      const batch = await this.claim();
      await Promise.all(batch.map((row) => this.purge(row)));
      if (batch.length < BATCH_SIZE) return;
    }
  }

  /** Its own short transaction: no storage call runs while it is open. */
  private async claim(): Promise<Claimed[]> {
    const result = await this.db.execute<{
      id: string;
      space_id: string;
      photo_id: string;
      overdue: boolean;
    }>(sql`
      UPDATE photo_object_purge SET attempts = attempts + 1, last_attempt_at = now()
      WHERE id IN (
        SELECT id FROM photo_object_purge
        WHERE due_at <= now()
          AND (last_attempt_at IS NULL OR last_attempt_at < now() - make_interval(mins => ${LEASE_MINUTES}))
        ORDER BY due_at
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED)
      RETURNING id, space_id, photo_id,
        due_at < now() - make_interval(hours => ${OVERDUE_HOURS}) AS overdue`);
    return result.rows.map((r) => ({
      id: r.id,
      spaceId: r.space_id,
      photoId: r.photo_id,
      overdue: r.overdue,
    }));
  }

  private async purge(row: Claimed): Promise<void> {
    if (row.overdue) {
      this.logger.error(
        { purgeId: row.id, spaceId: row.spaceId, photoId: row.photoId },
        'photo.purge_overdue',
      );
    }
    try {
      const keys = photoKeys(row.spaceId, row.photoId);
      // One DeleteObject per key; a missing key is success.
      await this.storage.deleteObject(keys.card);
      await this.storage.deleteObject(keys.display);
      await this.db.delete(photoObjectPurge).where(eq(photoObjectPurge.id, row.id));
    } catch (error) {
      // The claim already counted the attempt; the lease is the backoff.
      this.logger.warn(
        {
          purgeId: row.id,
          photoId: row.photoId,
          err: error instanceof Error ? error.name : 'unknown',
        },
        'photo.purge_failed',
      );
    }
  }
}
