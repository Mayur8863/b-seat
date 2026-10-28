import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
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
import { LabelTakenProblem } from '../common/errors/problem-types.js';
import {
  type CreateCubicleInput,
  CreateCubicleInputSchema,
  type CreateSeatsInput,
  CreateSeatsInputSchema,
  type Cubicle,
  type CubicleList,
  CubicleListSchema,
  CubicleSchema,
  type OwnerSeat,
  type OwnerSeatList,
  OwnerSeatListSchema,
  OwnerSeatSchema,
  type UpdateSeatInput,
  UpdateSeatInputSchema,
  UpdateCubicleInputSchema,
} from './owner-seats.schemas.js';
import { OwnerSeatsService } from './owner-seats.service.js';

const Id = z.uuid();

@ApiTags('owner-seats')
@ApiCookieAuth()
@Controller('owner/spaces/:spaceId')
@RequireRole('owner')
@ApiUnauthorizedResponse({ standardSchema: ProblemSchema, description: 'Not signed in' })
@ApiForbiddenResponse({ standardSchema: ProblemSchema, description: 'Renter account' })
@ApiBadRequestResponse({ standardSchema: ProblemSchema })
@ApiNotFoundResponse({ standardSchema: ProblemSchema })
export class OwnerSeatsController {
  constructor(private readonly seats: OwnerSeatsService) {}

  @Get('seats')
  @ApiOkResponse({ standardSchema: OwnerSeatListSchema })
  listSeats(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
  ): Promise<OwnerSeatList> {
    return this.seats.listSeats(session.user.id, spaceId);
  }

  @Post('seats')
  @ApiCreatedResponse({ standardSchema: OwnerSeatListSchema })
  @ApiConflictResponse({ standardSchema: LabelTakenProblem, description: 'listing:label-taken' })
  @ApiUnprocessableEntityResponse({
    standardSchema: ProblemSchema,
    description: 'More than 200 active seats (listing:seat-limit)',
  })
  createSeats(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
    @Body({ schema: CreateSeatsInputSchema }) input: CreateSeatsInput,
  ): Promise<OwnerSeatList> {
    return this.seats.createSeats(session.user.id, spaceId, input);
  }

  @Patch('seats/:seatId')
  @ApiOkResponse({ standardSchema: OwnerSeatSchema })
  @ApiConflictResponse({ standardSchema: LabelTakenProblem, description: 'listing:label-taken' })
  updateSeat(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
    @Param('seatId', { schema: Id }) seatId: string,
    @Body({ schema: UpdateSeatInputSchema }) input: UpdateSeatInput,
  ): Promise<OwnerSeat> {
    return this.seats.updateSeat(session.user.id, spaceId, seatId, input);
  }

  @Delete('seats/:seatId')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiConflictResponse({
    standardSchema: ProblemSchema,
    description: 'Upcoming bookings (listing:seat-has-future-bookings)',
  })
  deleteSeat(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
    @Param('seatId', { schema: Id }) seatId: string,
  ): Promise<void> {
    return this.seats.deleteSeat(session.user.id, spaceId, seatId);
  }

  @Get('cubicles')
  @ApiOkResponse({ standardSchema: CubicleListSchema })
  listCubicles(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
  ): Promise<CubicleList> {
    return this.seats.listCubicles(session.user.id, spaceId);
  }

  @Post('cubicles')
  @ApiCreatedResponse({ standardSchema: CubicleSchema })
  @ApiConflictResponse({
    standardSchema: ProblemSchema,
    description: 'Name already used (listing:cubicle-name-taken)',
  })
  createCubicle(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
    @Body({ schema: CreateCubicleInputSchema }) input: CreateCubicleInput,
  ): Promise<Cubicle> {
    return this.seats.createCubicle(session.user.id, spaceId, input);
  }

  @Patch('cubicles/:cubicleId')
  @ApiOkResponse({ standardSchema: CubicleSchema })
  @ApiConflictResponse({
    standardSchema: ProblemSchema,
    description: 'Name already used (listing:cubicle-name-taken)',
  })
  renameCubicle(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
    @Param('cubicleId', { schema: Id }) cubicleId: string,
    @Body({ schema: UpdateCubicleInputSchema }) input: CreateCubicleInput,
  ): Promise<Cubicle> {
    return this.seats.renameCubicle(session.user.id, spaceId, cubicleId, input);
  }

  @Delete('cubicles/:cubicleId')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiConflictResponse({
    standardSchema: ProblemSchema,
    description: 'Upcoming bookings (listing:seat-has-future-bookings)',
  })
  deleteCubicle(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
    @Param('cubicleId', { schema: Id }) cubicleId: string,
  ): Promise<void> {
    return this.seats.deleteCubicle(session.user.id, spaceId, cubicleId);
  }
}
