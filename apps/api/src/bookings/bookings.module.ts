import { Module } from '@nestjs/common';

import { clockProvider } from '../common/time/clock.js';
import { BookingCreatedHook, NoopBookingCreatedHook } from './booking-created.hook.js';
import { BookingsController } from './bookings.controller.js';
import { BookingsService } from './bookings.service.js';

@Module({
  controllers: [BookingsController],
  providers: [
    BookingsService,
    clockProvider,
    // T037 replaces this with the mail-queue implementation.
    { provide: BookingCreatedHook, useClass: NoopBookingCreatedHook },
  ],
  exports: [BookingsService],
})
export class BookingsModule {}
