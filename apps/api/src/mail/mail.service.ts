import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

import { REDIS } from '../redis/redis.module.js';

import { MAIL_QUEUE, type MailJob } from './mail.types.js';

/** Enqueues outbound mail; delivery happens in MailProcessor (retried on failure). */
@Injectable()
export class MailService {
  constructor(
    @InjectQueue(MAIL_QUEUE) private readonly queue: Queue<MailJob>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * `jobId` makes the enqueue idempotent: BullMQ ignores a job whose id it still holds
   * (ids must not contain a single `:`).
   */
  async send(job: MailJob, options: { jobId?: string } = {}): Promise<void> {
    // ioredis buffers commands while disconnected, so add() would hang until the caller's
    // timeout; fail at once and let the caller log the mail as not queued.
    if (this.redis.status !== 'ready') throw new Error('redis_not_ready');
    await this.queue.add('send', job, {
      jobId: options.jobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      // Count-based on purpose: completed ids stay for dedupe until 1 000 newer jobs push them out.
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  }
}
