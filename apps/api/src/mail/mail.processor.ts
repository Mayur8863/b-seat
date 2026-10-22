import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';
import nodemailer, { type Transporter } from 'nodemailer';

import type { Env } from '../config/env.js';
import { MAIL_QUEUE, type MailJob } from './mail.types.js';

@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly transport: Transporter;
  private readonly from: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(MailProcessor.name);
    this.from = config.get('MAIL_FROM', { infer: true });
    this.transport = nodemailer.createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: false,
    });
  }

  async process(job: Job<MailJob>): Promise<void> {
    await this.transport.sendMail({ from: this.from, ...job.data });
    // Never log message bodies: they can contain verification links.
    this.logger.info({ jobId: job.id, subject: job.data.subject }, 'mail sent');
  }
}
