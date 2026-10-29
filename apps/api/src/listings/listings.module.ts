import { Module } from '@nestjs/common';

import { clockProvider } from '../common/time/clock.js';
import { StorageModule } from '../storage/storage.module.js';
import { ListingsController } from './listings.controller.js';
import { ListingsService } from './listings.service.js';

@Module({
  imports: [StorageModule],
  controllers: [ListingsController],
  providers: [ListingsService, clockProvider],
})
export class ListingsModule {}
