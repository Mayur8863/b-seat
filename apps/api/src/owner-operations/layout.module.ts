import { Module } from '@nestjs/common';

import { ListingLayoutController, OwnerLayoutController } from './layout.controller.js';
import { LayoutService } from './layout.service.js';

@Module({
  controllers: [OwnerLayoutController, ListingLayoutController],
  providers: [LayoutService],
})
export class LayoutModule {}
