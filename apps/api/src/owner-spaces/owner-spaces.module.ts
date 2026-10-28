import { Module } from '@nestjs/common';

import { clockProvider } from '../common/time/clock.js';
import { OwnerSpacesController } from './owner-spaces.controller.js';
import { OwnerSpacesService } from './owner-spaces.service.js';

@Module({
  controllers: [OwnerSpacesController],
  providers: [OwnerSpacesService, clockProvider],
})
export class OwnerSpacesModule {}
