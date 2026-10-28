import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthSession } from '../auth/auth.js';
import { AuthGuard, CurrentSession } from '../auth/auth.guard.js';
import { RequireRole } from '../auth/roles.guard.js';
import { ProblemSchema } from '../common/errors/problem.js';
import {
  type ListingLayout,
  ListingLayoutSchema,
  type OwnerLayout,
  OwnerLayoutSchema,
  type SaveLayoutInput,
  SaveLayoutInputSchema,
} from './layout.schemas.js';
import { LayoutService } from './layout.service.js';

const Id = z.uuid();

@ApiTags('owner-layout')
@ApiCookieAuth()
@Controller('owner/spaces/:spaceId/layout')
@RequireRole('owner')
@ApiUnauthorizedResponse({ standardSchema: ProblemSchema, description: 'Not signed in' })
@ApiForbiddenResponse({ standardSchema: ProblemSchema, description: 'Renter account' })
@ApiBadRequestResponse({ standardSchema: ProblemSchema })
@ApiNotFoundResponse({ standardSchema: ProblemSchema })
export class OwnerLayoutController {
  constructor(private readonly layout: LayoutService) {}

  @Get()
  @ApiOkResponse({ standardSchema: OwnerLayoutSchema })
  get(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
  ): Promise<OwnerLayout> {
    return this.layout.getOwner(session.user.id, spaceId);
  }

  @Put()
  @ApiOkResponse({ standardSchema: OwnerLayoutSchema })
  @ApiConflictResponse({ standardSchema: ProblemSchema, description: 'layout:stale-version' })
  @ApiUnprocessableEntityResponse({
    standardSchema: ProblemSchema,
    description: 'layout:out-of-bounds',
  })
  save(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
    @Body({ schema: SaveLayoutInputSchema }) input: SaveLayoutInput,
  ): Promise<OwnerLayout> {
    return this.layout.save(session.user.id, spaceId, input);
  }
}

@ApiTags('listings')
@ApiCookieAuth()
@Controller('listings/:spaceId/layout')
@UseGuards(AuthGuard)
@ApiUnauthorizedResponse({ standardSchema: ProblemSchema, description: 'Not signed in' })
@ApiBadRequestResponse({ standardSchema: ProblemSchema })
@ApiNotFoundResponse({ standardSchema: ProblemSchema, description: 'No layout, or not published' })
export class ListingLayoutController {
  constructor(private readonly layout: LayoutService) {}

  @Get()
  @ApiOkResponse({ standardSchema: ListingLayoutSchema })
  get(
    @CurrentSession() _session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
  ): Promise<ListingLayout> {
    return this.layout.getListing(spaceId);
  }
}
