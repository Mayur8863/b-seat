import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';

import type { Env } from '../config/env.js';
import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import { space, user } from '../db/schema/index.js';
import { MailService } from '../mail/mail.service.js';
import type { MailJob } from '../mail/mail.types.js';
import { BookingCreatedHook, type BookingCreatedEvent } from './booking-created.hook.js';
import { buildBookingEmails, ownerJobId, renterJobId } from './booking-emails.js';

/** Each enqueue may hold the 201 for this long (booking-emails.md); the two run concurrently. */
const ENQUEUE_TIMEOUT_MS = 2000;

/** Queues the renter confirmation and the owner notification once a booking has committed. */
@Injectable()
export class MailBookingCreatedHook extends BookingCreatedHook {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly mail: MailService,
    private readonly logger: PinoLogger,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
    this.logger.setContext(MailBookingCreatedHook.name);
  }

  async onCreated(event: BookingCreatedEvent): Promise<void> {
    const [renter] = await this.db
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, event.userId));
    const [owner] = await this.db
      .select({ name: user.name, email: user.email })
      .from(space)
      .innerJoin(user, eq(user.id, space.ownerId))
      .where(eq(space.id, event.spaceId));

    const jobs: { recipient: 'renter' | 'owner'; job: MailJob; jobId: string }[] = [];
    if (renter && owner) {
      const mails = buildBookingEmails(
        event.booking,
        renter,
        owner,
        this.config.get('NEXT_PUBLIC_APP_URL', { infer: true }),
      );
      jobs.push(
        { recipient: 'renter', job: mails.renter, jobId: renterJobId(event.bookingId) },
        { recipient: 'owner', job: mails.owner, jobId: ownerJobId(event.bookingId) },
      );
    }
    await Promise.all(jobs.map((j) => this.enqueue(event.bookingId, j)));
  }

  /** Never throws: a failed or slow enqueue is logged (ids only, no address or body) and dropped. */
  private async enqueue(
    bookingId: string,
    { recipient, job, jobId }: { recipient: string; job: MailJob; jobId: string },
  ): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('timeout'));
      }, ENQUEUE_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.mail.send(job, { jobId }), timeout]);
    } catch {
      this.logger.error({ bookingId, recipient }, 'booking.email_enqueue_failed');
    } finally {
      clearTimeout(timer);
    }
  }
}
