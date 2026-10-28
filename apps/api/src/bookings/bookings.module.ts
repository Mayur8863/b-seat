import { Module } from '@nestjs/common';

import { clockProvider } from '../common/time/clock.js';
import { BookingCreatedHook } from './booking-created.hook.js';
import { MailBookingCreatedHook } from './booking-emails.hook.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  controllers: [BookingsController],
  providers: [
    BookingsService,
    clockProvider,
    { provide: BookingCreatedHook, useClass: MailBookingCreatedHook },
  ],
  exports: [BookingsService],
})
export class BookingsModule {}
