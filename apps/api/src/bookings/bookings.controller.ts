import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthSession } from '../auth/auth.js';
import { AuthGuard, CurrentSession } from '../auth/auth.guard.js';
import { ApiQueryFromSchema } from '../common/openapi/api-query-schema.js';
import { ProblemSchema } from '../common/errors/problem.js';
import {
  type Booking,
  BookingSchema,
  type CreateBookingInput,
  CreateBookingInputSchema,
  type BookingList,
  BookingListSchema,
  type ListMyBookingsInput,
  ListMyBookingsInputSchema,
} from './bookings.schemas.js';
import { BookingsService } from './bookings.service.js';

@ApiTags('bookings')
@ApiCookieAuth()
@Controller()
@UseGuards(AuthGuard)
@ApiUnauthorizedResponse({ standardSchema: ProblemSchema, description: 'Not signed in' })
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post('listings/:spaceId/bookings')
  @ApiCreatedResponse({ standardSchema: BookingSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  @ApiConflictResponse({
    standardSchema: ProblemSchema,
    description: 'booking:seat-unavailable or booking:user-overlap',
  })
  @ApiUnprocessableEntityResponse({
    standardSchema: ProblemSchema,
    description:
      'booking-rule:space-not-published, own-space, pass-not-offered, start-day-closed, slot-started or too-far-ahead',
  })
  create(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: z.uuid() }) spaceId: string,
    @Body({ schema: CreateBookingInputSchema }) input: CreateBookingInput,
  ): Promise<Booking> {
    return this.bookings.create(session.user.id, spaceId, input);
  }

  @Get('bookings')
  @ApiQueryFromSchema(ListMyBookingsInputSchema)
  @ApiOkResponse({ standardSchema: BookingListSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  listMine(
    @CurrentSession() session: AuthSession,
    @Query({ schema: ListMyBookingsInputSchema }) query: ListMyBookingsInput,
  ): Promise<BookingList> {
    return this.bookings.listMine(session.user.id, query);
  }

  @Post('bookings/:bookingId/cancel')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: BookingSchema, description: 'Cancelled (or already was)' })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema })
  @ApiConflictResponse({
    standardSchema: ProblemSchema,
    description: 'booking:already-started',
  })
  cancel(
    @CurrentSession() session: AuthSession,
    @Param('bookingId', { schema: z.uuid() }) bookingId: string,
  ): Promise<Booking> {
    return this.bookings.cancel(session.user.id, bookingId);
  }
}
