import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthSession } from '../auth/auth.js';
import { AuthGuard, CurrentSession } from '../auth/auth.guard.js';
import { ProblemSchema } from '../common/errors/problem.js';
import { ApiQueryFromSchema } from '../common/openapi/api-query-schema.js';
import {
  type AvailabilityQueryInput,
  AvailabilityQueryInputSchema,
  type SpaceAvailability,
  SpaceAvailabilitySchema,
  type SpaceList,
  SpaceListSchema,
} from './spaces.schemas.js';
import { SpacesService } from './spaces.service.js';

@ApiTags('spaces')
@ApiCookieAuth()
@Controller('spaces')
@UseGuards(AuthGuard)
@ApiUnauthorizedResponse({ standardSchema: ProblemSchema, description: 'Not signed in' })
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  // Spaces are shared reference data, so the session only gates access (contracts/spaces.md).
  @Get()
  @ApiOkResponse({ standardSchema: SpaceListSchema })
  list(@CurrentSession() _session: AuthSession): Promise<SpaceList> {
    return this.spaces.list();
  }

  @Get(':spaceId/availability')
  @ApiQueryFromSchema(AvailabilityQueryInputSchema)
  @ApiOkResponse({ standardSchema: SpaceAvailabilitySchema })
  @ApiBadRequestResponse({
    standardSchema: ProblemSchema,
    description: 'Malformed id, date or time, or endTime <= startTime',
  })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema, description: 'Space not found' })
  @ApiUnprocessableEntityResponse({
    standardSchema: ProblemSchema,
    description: 'The window falls in a daylight-saving gap or overlap (invalid-local-time)',
  })
  availability(
    @CurrentSession() _session: AuthSession,
    @Param('spaceId', { schema: z.uuid() }) spaceId: string,
    @Query({ schema: AvailabilityQueryInputSchema }) query: AvailabilityQueryInput,
  ): Promise<SpaceAvailability> {
    return this.spaces.availability(spaceId, query);
  }
}
