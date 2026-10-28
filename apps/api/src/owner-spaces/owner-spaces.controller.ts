import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthSession } from '../auth/auth.js';
import { CurrentSession } from '../auth/auth.guard.js';
import { RequireRole } from '../auth/roles.guard.js';
import { ProblemSchema } from '../common/errors/problem.js';
import { PublishIncompleteProblem } from '../common/errors/problem-types.js';
import {
  type CreateSpaceInput,
  CreateSpaceInputSchema,
  type OwnerSpace,
  type SpacePricing,
  SpacePricingSchema,
  type UpdatePricingInput,
  UpdatePricingInputSchema,
  type OwnerSpaceList,
  OwnerSpaceListSchema,
  OwnerSpaceSchema,
  type UpdateSpaceInput,
  UpdateSpaceInputSchema,
} from './owner-spaces.schemas.js';
import { OwnerSpacesService } from './owner-spaces.service.js';

const SpaceId = z.uuid();

@ApiTags('owner-spaces')
@ApiCookieAuth()
@Controller('owner/spaces')
@RequireRole('owner')
@ApiUnauthorizedResponse({ standardSchema: ProblemSchema, description: 'Not signed in' })
@ApiForbiddenResponse({ standardSchema: ProblemSchema, description: 'Renter account' })
export class OwnerSpacesController {
  constructor(private readonly spaces: OwnerSpacesService) {}

  @Get()
  @ApiOkResponse({ standardSchema: OwnerSpaceListSchema })
  list(@CurrentSession() session: AuthSession): Promise<OwnerSpaceList> {
    return this.spaces.list(session.user.id);
  }

  @Post()
  @ApiCreatedResponse({ standardSchema: OwnerSpaceSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  create(
    @CurrentSession() session: AuthSession,
    @Body({ schema: CreateSpaceInputSchema }) input: CreateSpaceInput,
  ): Promise<OwnerSpace> {
    return this.spaces.create(session.user.id, input);
  }

  @Get(':spaceId')
  @ApiOkResponse({ standardSchema: OwnerSpaceSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  get(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: SpaceId }) spaceId: string,
  ): Promise<OwnerSpace> {
    return this.spaces.get(session.user.id, spaceId);
  }

  @Patch(':spaceId')
  @ApiOkResponse({ standardSchema: OwnerSpaceSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  update(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: SpaceId }) spaceId: string,
    @Body({ schema: UpdateSpaceInputSchema }) input: UpdateSpaceInput,
  ): Promise<OwnerSpace> {
    return this.spaces.update(session.user.id, spaceId, input);
  }

  @Post(':spaceId/publish')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: OwnerSpaceSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  @ApiUnprocessableEntityResponse({
    standardSchema: PublishIncompleteProblem,
    description: 'No active seat or no offered pass (listing:publish-incomplete)',
  })
  publish(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: SpaceId }) spaceId: string,
  ): Promise<OwnerSpace> {
    return this.spaces.publish(session.user.id, spaceId);
  }

  @Post(':spaceId/unpublish')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: OwnerSpaceSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  unpublish(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: SpaceId }) spaceId: string,
  ): Promise<OwnerSpace> {
    return this.spaces.unpublish(session.user.id, spaceId);
  }

  @Get(':spaceId/pricing')
  @ApiOkResponse({ standardSchema: SpacePricingSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  getPricing(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: SpaceId }) spaceId: string,
  ): Promise<SpacePricing> {
    return this.spaces.getPricing(session.user.id, spaceId);
  }

  @Put(':spaceId/pricing')
  @ApiOkResponse({ standardSchema: SpacePricingSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  updatePricing(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: SpaceId }) spaceId: string,
    @Body({ schema: UpdatePricingInputSchema }) input: UpdatePricingInput,
  ): Promise<SpacePricing> {
    return this.spaces.updatePricing(session.user.id, spaceId, input);
  }
}
