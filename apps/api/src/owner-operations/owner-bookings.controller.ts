import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
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
import { ApiQueryFromSchema } from '../common/openapi/api-query-schema.js';
import {
  type ListOwnerBookingsInput,
  ListOwnerBookingsInputSchema,
  type OwnerBookingList,
  OwnerBookingListSchema,
} from './owner-bookings.schemas.js';
import { OwnerBookingsService } from './owner-bookings.service.js';

// The class name gives the operation id `OwnerOperations_listBookings` (contract, hook name).
@ApiTags('owner-operations')
@ApiCookieAuth()
@Controller('owner/spaces/:spaceId/bookings')
@RequireRole('owner')
@ApiUnauthorizedResponse({ standardSchema: ProblemSchema, description: 'Not signed in' })
@ApiForbiddenResponse({ standardSchema: ProblemSchema, description: 'Renter account' })
export class OwnerOperationsController {
  constructor(private readonly bookings: OwnerBookingsService) {}

  @Get()
  @ApiQueryFromSchema(ListOwnerBookingsInputSchema)
  @ApiOkResponse({ standardSchema: OwnerBookingListSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema, description: 'to < from, bad cursor' })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  listBookings(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: z.uuid() }) spaceId: string,
    @Query({ schema: ListOwnerBookingsInputSchema }) query: ListOwnerBookingsInput,
  ): Promise<OwnerBookingList> {
    return this.bookings.list(session.user.id, spaceId, query);
  }
}
