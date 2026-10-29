import { Processor, WorkerHost } from '@nestjs/bullmq';

import { PhotoPurgeService } from './photo-purge.service.js';
import { PHOTO_PURGE_QUEUE } from './photo-purge.types.js';

@Processor(PHOTO_PURGE_QUEUE)
export class PhotoPurgeProcessor extends WorkerHost {
  constructor(private readonly purge: PhotoPurgeService) {
    super();
  }

  async process(): Promise<void> {
    await this.purge.sweep();
  }
}
