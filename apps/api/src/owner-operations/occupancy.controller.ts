import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthSession } from '../auth/auth.js';
import { CurrentSession } from '../auth/auth.guard.js';
import { RequireRole } from '../auth/roles.guard.js';
import { ProblemSchema } from '../common/errors/problem.js';
import { OccupancyConflictProblem } from '../common/errors/problem-types.js';
import { ApiQueryFromSchema } from '../common/openapi/api-query-schema.js';
import {
  type ListOccupancyInput,
  ListOccupancyInputSchema,
  type MarkOccupiedInput,
  MarkOccupiedInputSchema,
  type OccupancyMark,
  OccupancyMarkListSchema,
  OccupancyMarkSchema,
  type OccupancyMarkList,
} from './occupancy.schemas.js';
import { OccupancyService } from './occupancy.service.js';

const Id = z.uuid();

@ApiTags('owner-operations')
@ApiCookieAuth()
@Controller('owner/spaces/:spaceId/occupancy')
@RequireRole('owner')
@ApiUnauthorizedResponse({ standardSchema: ProblemSchema, description: 'Not signed in' })
@ApiForbiddenResponse({ standardSchema: ProblemSchema, description: 'Renter account' })
@ApiBadRequestResponse({ standardSchema: ProblemSchema })
@ApiNotFoundResponse({ standardSchema: ProblemSchema })
export class OccupancyController {
  constructor(private readonly occupancy: OccupancyService) {}

  @Get()
  @ApiQueryFromSchema(ListOccupancyInputSchema)
  @ApiOkResponse({ standardSchema: OccupancyMarkListSchema })
  list(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
    @Query({ schema: ListOccupancyInputSchema }) query: ListOccupancyInput,
  ): Promise<OccupancyMarkList> {
    return this.occupancy.list(session.user.id, spaceId, query);
  }

  @Post()
  @ApiCreatedResponse({ standardSchema: OccupancyMarkListSchema })
  @ApiConflictResponse({
    standardSchema: OccupancyConflictProblem,
    description: 'occupancy:conflicts-with-bookings or occupancy:already-occupied',
  })
  mark(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
    @Body({ schema: MarkOccupiedInputSchema }) input: MarkOccupiedInput,
  ): Promise<OccupancyMarkList> {
    return this.occupancy.mark(session.user.id, spaceId, input);
  }

  @Post(':markId/end')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: OccupancyMarkSchema })
  end(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
    @Param('markId', { schema: Id }) markId: string,
  ): Promise<OccupancyMark> {
    return this.occupancy.end(session.user.id, spaceId, markId);
  }
}
