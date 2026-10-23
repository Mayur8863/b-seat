import { Module } from '@nestjs/common';

import { clockProvider } from '../common/time/clock.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  controllers: [BookingsController],
  providers: [BookingsService, clockProvider],
})
export class BookingsModule {}
