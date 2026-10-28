import { Module } from '@nestjs/common';

import { clockProvider } from '../common/time/clock.js';
import { CalendarsController } from './calendars.controller.js';
import { CalendarsService } from './calendars.service.js';

@Module({
  controllers: [CalendarsController],
  providers: [CalendarsService, clockProvider],
})
export class CalendarsModule {}
