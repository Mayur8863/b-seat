import { Module } from '@nestjs/common';

import { clockProvider } from '../common/time/clock.js';
import { StorageModule } from '../storage/storage.module.js';
import { SpacePhotosController } from './space-photos.controller.js';
import { SpacePhotosService } from './space-photos.service.js';
import { UploadAdmissionGuard } from './upload-admission.guard.js';

@Module({
  imports: [StorageModule],
  controllers: [SpacePhotosController],
  providers: [SpacePhotosService, UploadAdmissionGuard, clockProvider],
})
export class PhotosModule {}
