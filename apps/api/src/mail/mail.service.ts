import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import { MAIL_QUEUE, type MailJob } from './mail.types.js';

/** Enqueues outbound mail; delivery happens in MailProcessor (retried on failure). */
@Injectable()
export class MailService {
  constructor(@InjectQueue(MAIL_QUEUE) private readonly queue: Queue<MailJob>) {}

  /**
   * `jobId` makes the enqueue idempotent: BullMQ ignores a job whose id it still holds
   * (ids must not contain a single `:`).
   */
  async send(job: MailJob, options: { jobId?: string } = {}): Promise<void> {
    await this.queue.add('send', job, {
      jobId: options.jobId,
      attempts: 5,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  }
}
