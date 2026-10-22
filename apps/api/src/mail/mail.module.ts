import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';

import { MailProcessor } from './mail.processor.js';
import { MailService } from './mail.service.js';
import { MAIL_QUEUE } from './mail.types.js';

@Global()
@Module({
  imports: [BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [MailService, MailProcessor],
  exports: [MailService],
})
export class MailModule {}
