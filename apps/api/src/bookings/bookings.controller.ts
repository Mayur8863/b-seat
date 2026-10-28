import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthSession } from '../auth/auth.js';
import { AuthGuard, CurrentSession } from '../auth/auth.guard.js';
import { ProblemSchema } from '../common/errors/problem.js';
import {
  type Booking,
  BookingSchema,
  type CreateBookingInput,
  CreateBookingInputSchema,
} from './bookings.schemas.js';
import { BookingsService } from './bookings.service.js';

@ApiTags('bookings')
@ApiCookieAuth()
@Controller('listings/:spaceId/bookings')
@UseGuards(AuthGuard)
@ApiUnauthorizedResponse({ standardSchema: ProblemSchema, description: 'Not signed in' })
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
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
}
