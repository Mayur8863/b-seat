import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';

import type { Env } from '../config/env.js';
import type { Database } from '../db/db.js';
import { MailService } from '../mail/mail.service.js';
import { BookingCreatedHook, type BookingCreatedEvent } from './booking-created.hook.js';

@Injectable()
export class MailBookingCreatedHook extends BookingCreatedHook {
  constructor(
    _db: Database,
    _mail: MailService,
    _logger: PinoLogger,
    _config: ConfigService<Env, true>,
  ) {
    super();
  }

  onCreated(_event: BookingCreatedEvent): Promise<void> {
    return Promise.reject(new Error('not implemented'));
  }
}
