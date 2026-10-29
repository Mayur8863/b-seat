import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import type { Queue } from 'bullmq';

export const PHOTO_PURGE_QUEUE = 'photo-purge';
export const PHOTO_PURGE_SCHEDULER_ID = 'photo-purge-sweep';
export const SWEEP_EVERY_MS = 5 * 60_000;

/** upsertJobScheduler is idempotent, so every API task can call it at boot (ADR-0011 section 9). */
@Injectable()
export class PhotoPurgeScheduler implements OnApplicationBootstrap {
  constructor(@InjectQueue(PHOTO_PURGE_QUEUE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.queue.upsertJobScheduler(
      PHOTO_PURGE_SCHEDULER_ID,
      { every: SWEEP_EVERY_MS },
      { name: 'sweep', opts: { removeOnComplete: true, removeOnFail: 100 } },
    );
  }
}
