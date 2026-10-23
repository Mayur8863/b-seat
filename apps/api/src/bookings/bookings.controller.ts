import { Body, Controller, Post, UseGuards } from '@nestjs/common';
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

import type { AuthSession } from '../auth/auth.js';
import { AuthGuard, CurrentSession } from '../auth/auth.guard.js';
import { ProblemSchema } from '../common/errors/problem.js';
import {
  type Booking,
  type CreateBookingInput,
  CreateBookingInputSchema,
  BookingSchema,
} from './bookings.schemas.js';
import { BookingsService, type Caller } from './bookings.service.js';

function callerOf(session: AuthSession): Caller {
  const { id, name, email } = session.user;
  return { id, name, email };
}

@ApiTags('bookings')
@ApiCookieAuth()
@Controller('bookings')
@UseGuards(AuthGuard)
@ApiUnauthorizedResponse({ standardSchema: ProblemSchema, description: 'Not signed in' })
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Post()
  @ApiCreatedResponse({ standardSchema: BookingSchema, description: 'The new booking' })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema, description: 'Malformed body' })
  @ApiNotFoundResponse({ standardSchema: ProblemSchema, description: 'Seat not found' })
  @ApiConflictResponse({
    standardSchema: ProblemSchema,
    description: 'booking:seat-unavailable or booking:user-overlap',
  })
  @ApiUnprocessableEntityResponse({
    standardSchema: ProblemSchema,
    description: 'The window breaks a booking rule (booking-rule:*)',
  })
  create(
    @CurrentSession() session: AuthSession,
    @Body({ schema: CreateBookingInputSchema }) input: CreateBookingInput,
  ): Promise<Booking> {
    return this.bookings.create(callerOf(session), input);
  }
}
