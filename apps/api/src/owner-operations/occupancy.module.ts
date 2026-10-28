import { Module } from '@nestjs/common';

import { clockProvider } from '../common/time/clock.js';
import { OccupancyController } from './occupancy.controller.js';
import { OccupancyService } from './occupancy.service.js';

@Module({
  controllers: [OccupancyController],
  providers: [OccupancyService, clockProvider],
})
export class OccupancyModule {}
