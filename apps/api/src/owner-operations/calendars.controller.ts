import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
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
import {
  type CalendarChange,
  CalendarChangeSchema,
  type CalendarInput,
  CalendarInputSchema,
  type SpaceCalendars,
  SpaceCalendarsSchema,
} from './calendars.schemas.js';
import { CalendarsService } from './calendars.service.js';

const Id = z.uuid();

@ApiTags('owner-operations')
@ApiCookieAuth()
@Controller('owner/spaces/:spaceId')
@RequireRole('owner')
@ApiUnauthorizedResponse({ standardSchema: ProblemSchema, description: 'Not signed in' })
@ApiForbiddenResponse({ standardSchema: ProblemSchema, description: 'Renter account' })
@ApiBadRequestResponse({ standardSchema: ProblemSchema })
@ApiNotFoundResponse({ standardSchema: ProblemSchema })
export class CalendarsController {
  constructor(private readonly calendars: CalendarsService) {}

  @Get('calendars')
  @ApiOkResponse({ standardSchema: SpaceCalendarsSchema })
  list(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
  ): Promise<SpaceCalendars> {
    return this.calendars.list(session.user.id, spaceId);
  }

  @Put('calendars/shared')
  @ApiOkResponse({ standardSchema: CalendarChangeSchema })
  putShared(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
    @Body({ schema: CalendarInputSchema }) input: CalendarInput,
  ): Promise<CalendarChange> {
    return this.calendars.putShared(session.user.id, spaceId, input);
  }

  @Put('seats/:seatId/calendar')
  @ApiOkResponse({ standardSchema: CalendarChangeSchema })
  putSeat(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
    @Param('seatId', { schema: Id }) seatId: string,
    @Body({ schema: CalendarInputSchema }) input: CalendarInput,
  ): Promise<CalendarChange> {
    return this.calendars.putSeat(session.user.id, spaceId, seatId, input);
  }

  @Delete('seats/:seatId/calendar')
  @ApiOkResponse({ standardSchema: CalendarChangeSchema })
  removeSeat(
    @CurrentSession() session: AuthSession,
    @Param('spaceId', { schema: Id }) spaceId: string,
    @Param('seatId', { schema: Id }) seatId: string,
  ): Promise<CalendarChange> {
    return this.calendars.removeSeat(session.user.id, spaceId, seatId);
  }
}
