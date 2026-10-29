import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { clockProvider } from '../common/time/clock.js';
import { StorageModule } from '../storage/storage.module.js';
import { PhotoPurgeProcessor } from './photo-purge.processor.js';
import { PhotoPurgeService } from './photo-purge.service.js';
import { PHOTO_PURGE_QUEUE, PhotoPurgeScheduler } from './photo-purge.types.js';
import { SpacePhotosController } from './space-photos.controller.js';
import { SpacePhotosService } from './space-photos.service.js';
import { UploadAdmissionGuard } from './upload-admission.guard.js';

@Module({
  imports: [StorageModule, BullModule.registerQueue({ name: PHOTO_PURGE_QUEUE })],
  controllers: [SpacePhotosController],
  providers: [
    SpacePhotosService,
    PhotoPurgeService,
    PhotoPurgeProcessor,
    PhotoPurgeScheduler,
    UploadAdmissionGuard,
    clockProvider,
  ],
})
export class PhotosModule {}
