import { Module } from '@nestjs/common';

import { clockProvider } from '../common/time/clock.js';
import { OwnerSeatsController } from './owner-seats.controller.js';
import { OwnerSeatsService } from './owner-seats.service.js';
import { OwnerSpacesController } from './owner-spaces.controller.js';
import { OwnerSpacesService } from './owner-spaces.service.js';

@Module({
  controllers: [OwnerSpacesController, OwnerSeatsController],
  providers: [OwnerSpacesService, OwnerSeatsService, clockProvider],
})
export class OwnerSpacesModule {}
