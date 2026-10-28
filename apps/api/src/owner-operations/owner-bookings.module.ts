import { Module } from '@nestjs/common';

import { clockProvider } from '../common/time/clock.js';
import { OwnerOperationsController } from './owner-bookings.controller.js';
import { OwnerBookingsService } from './owner-bookings.service.js';

@Module({
  controllers: [OwnerOperationsController],
  providers: [OwnerBookingsService, clockProvider],
})
export class OwnerBookingsModule {}
