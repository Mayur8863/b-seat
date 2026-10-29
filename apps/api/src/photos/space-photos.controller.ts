import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Put,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  type ApiBodyOptions,
  ApiConflictResponse,
  ApiNoContentResponse,
  ApiConsumes,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthSession } from '../auth/auth.js';
import { CurrentSession } from '../auth/auth.guard.js';
import { RequireRole } from '../auth/roles.guard.js';
import { ProblemSchema } from '../common/errors/problem.js';
import {
  PhotoDimensionsProblem,
  PhotoFormatProblem,
  PhotoLimitProblem,
  PhotoTooLargeProblem,
} from '../common/errors/problem-types.js';
import { RequestValidationException } from '../common/errors/validation.js';
import { PhotoUploadErrorInterceptor } from './photo-upload.interceptor.js';
import {
  type DescribeSpacePhotoInput,
  DescribeSpacePhotoInputSchema,
  type OwnerSpacePhoto,
  OwnerSpacePhotoSchema,
  type OwnerSpacePhotos,
  OwnerSpacePhotosSchema,
  type ReorderSpacePhotosInput,
  ReorderSpacePhotosInputSchema,
} from './space-photos.schemas.js';
import { SpacePhotosService } from './space-photos.service.js';
import { UploadAdmissionGuard } from './upload-admission.guard.js';
import { uploadStorage } from './upload-storage.js';

const SpaceId = z.uuid();
// ApiBody has no Standard Schema option, so the multipart body is written out (UploadSpacePhotoInput).
const UPLOAD_BODY: ApiBodyOptions = {
  schema: {
    type: 'object',
    title: 'UploadSpacePhotoInput',
    required: ['file'],
    additionalProperties: false,
    properties: {
      file: {
        type: 'string',
        format: 'binary',
        description: 'One JPEG, PNG or WebP image, at most 10 MB',
      },
    },
  },
};
const MAX_FILE_BYTES = 10 * 1024 * 1024;

@ApiTags('space-photos')
@ApiCookieAuth()
@Controller('owner/spaces/:spaceId/photos')
@RequireRole('owner')
@ApiUnauthorizedResponse({ standardSchema: ProblemSchema, description: 'Not signed in' })
@ApiForbiddenResponse({
  standardSchema: ProblemSchema,
  description: 'Renter account or foreign Origin',
})
export class SpacePhotosController {
  constructor(private readonly photos: SpacePhotosService) {}

  @Get()
  @ApiOkResponse({ standardSchema: OwnerSpacePhotosSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  list(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: SpaceId }) spaceId: string,
  ): Promise<OwnerSpacePhotos> {
    return this.photos.list(session.user.id, spaceId);
  }

  @Patch(':photoId')
  @ApiOkResponse({ standardSchema: OwnerSpacePhotoSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  describe(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: SpaceId }) spaceId: string,
    @Param('photoId', { schema: SpaceId }) photoId: string,
    @Body({ schema: DescribeSpacePhotoInputSchema }) input: DescribeSpacePhotoInput,
  ): Promise<OwnerSpacePhoto> {
    return this.photos.describe(session.user.id, spaceId, photoId, input);
  }

  @Put('order')
  @ApiOkResponse({ standardSchema: OwnerSpacePhotosSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  @ApiConflictResponse({ standardSchema: ProblemSchema, description: 'photo:order-stale' })
  reorder(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: SpaceId }) spaceId: string,
    @Body({ schema: ReorderSpacePhotosInputSchema }) input: ReorderSpacePhotosInput,
  ): Promise<OwnerSpacePhotos> {
    return this.photos.reorder(session.user.id, spaceId, input);
  }

  @Delete(':photoId')
  @HttpCode(204)
  @ApiNoContentResponse({ description: 'Deleted; the files are removed by the purge sweep' })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  remove(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: SpaceId }) spaceId: string,
    @Param('photoId', { schema: SpaceId }) photoId: string,
  ): Promise<void> {
    return this.photos.remove(session.user.id, spaceId, photoId);
  }

  @Post()
  // Guards run before interceptors, so admission is decided before multer reads the body. The
  // global CsrfGuard (Origin / Sec-Fetch-Site) runs before all of them.
  @UseGuards(UploadAdmissionGuard)
  @UseInterceptors(
    PhotoUploadErrorInterceptor,
    FileInterceptor('file', {
      storage: uploadStorage,
      limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 0, parts: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody(UPLOAD_BODY)
  @ApiCreatedResponse({ standardSchema: OwnerSpacePhotoSchema })
  @ApiBadRequestResponse({
    standardSchema: ProblemSchema,
    description: 'No file part, or extra parts',
  })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  @ApiConflictResponse({ standardSchema: PhotoLimitProblem, description: 'photo:limit-reached' })
  @ApiResponse({
    status: 413,
    standardSchema: PhotoTooLargeProblem,
    description: 'photo:too-large',
  })
  @ApiResponse({
    status: 415,
    standardSchema: PhotoFormatProblem,
    description: 'photo:unsupported-format',
  })
  @ApiResponse({
    status: 422,
    standardSchema: PhotoDimensionsProblem,
    description: 'photo:dimensions-out-of-range or photo:unreadable',
  })
  @ApiServiceUnavailableResponse({
    standardSchema: ProblemSchema,
    description: 'photo:busy, with Retry-After',
  })
  upload(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: SpaceId }) spaceId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<OwnerSpacePhoto> {
    if (!file) {
      throw new RequestValidationException([
        { path: 'file', message: 'Send one image in a part named "file"' },
      ]);
    }
    return this.photos.add(session.user.id, spaceId, file.buffer);
  }
}
