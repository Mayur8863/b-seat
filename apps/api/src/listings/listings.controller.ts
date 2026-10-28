import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthSession } from '../auth/auth.js';
import { AuthGuard, CurrentSession } from '../auth/auth.guard.js';
import { ProblemSchema } from '../common/errors/problem.js';
import {
  type Listing,
  type ListingSeatAvailability,
  ListingSchema,
  ListingSeatAvailabilitySchema,
  type SeatAvailabilityInput,
  SeatAvailabilityInputSchema,
} from './listings.schemas.js';
import { ListingsService } from './listings.service.js';

@ApiTags('listings')
@ApiCookieAuth()
@Controller('listings')
@UseGuards(AuthGuard)
@ApiUnauthorizedResponse({ standardSchema: ProblemSchema, description: 'Not signed in' })
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get(':spaceId')
  @ApiOkResponse({ standardSchema: ListingSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  get(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: z.uuid() }) spaceId: string,
  ): Promise<Listing> {
    return this.listings.get(session.user.id, spaceId);
  }

  @Get(':spaceId/seats')
  @ApiOkResponse({ standardSchema: ListingSeatAvailabilitySchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  @ApiUnprocessableEntityResponse({
    standardSchema: ProblemSchema,
    description: 'booking-rule:pass-not-offered',
  })
  seats(
    @Param('spaceId', { schema: z.uuid() }) spaceId: string,
    @Query({ schema: SeatAvailabilityInputSchema }) query: SeatAvailabilityInput,
  ): Promise<ListingSeatAvailability> {
    return this.listings.seatAvailability(spaceId, query);
  }
}
