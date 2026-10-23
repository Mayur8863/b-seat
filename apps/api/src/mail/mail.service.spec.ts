import type { Queue } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';

import { MailService } from './mail.service.js';
import type { MailJob } from './mail.types.js';

const JOB: MailJob = { to: 'ada@example.com', subject: 'Hi', text: 'Hello' };

function serviceWithQueue() {
  const add = vi.fn(() => Promise.resolve());
  const service = new MailService({ add } as unknown as Queue<MailJob>);
  return { service, add };
}

describe('MailService.send', () => {
  it('queues the mail with retries and an id assigned by BullMQ', async () => {
    const { service, add } = serviceWithQueue();

    await service.send(JOB);

    expect(add).toHaveBeenCalledWith(
      'send',
      JOB,
      expect.objectContaining({ attempts: 5, jobId: undefined }),
    );
  });

  it('passes a caller-chosen job id so BullMQ deduplicates the mail', async () => {
    const { service, add } = serviceWithQueue();

    await service.send(JOB, { jobId: 'booking-confirmed-1' });

    expect(add).toHaveBeenCalledWith(
      'send',
      JOB,
      expect.objectContaining({ jobId: 'booking-confirmed-1' }),
    );
  });
});
