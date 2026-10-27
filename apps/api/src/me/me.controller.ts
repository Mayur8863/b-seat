import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { AuthSession } from '../auth/auth.js';
import { AuthGuard, CurrentSession } from '../auth/auth.guard.js';
import { RequireRole } from '../auth/roles.guard.js';
import { ProblemSchema } from '../common/errors/problem.js';
import {
  type Me,
  MeSchema,
  type Preferences,
  PreferencesSchema,
  type UpdatePreferencesInput,
  UpdatePreferencesInputSchema,
} from './me.schemas.js';
import { MeService } from './me.service.js';

@ApiTags('me')
@ApiCookieAuth()
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @ApiOkResponse({ standardSchema: MeSchema })
  @ApiUnauthorizedResponse({ standardSchema: ProblemSchema })
  async get(@CurrentSession() session: AuthSession): Promise<Me> {
    const { id, name, email, emailVerified, accountType } = session.user;
    const preferences = await this.me.getPreferences(id);
    return { id, name, email, emailVerified, accountType, preferences };
  }

  @Put('preferences')
  @RequireRole('renter')
  @ApiOkResponse({ standardSchema: PreferencesSchema })
  @ApiBadRequestResponse({ standardSchema: ProblemSchema })
  @ApiUnauthorizedResponse({ standardSchema: ProblemSchema })
  @ApiForbiddenResponse({ standardSchema: ProblemSchema, description: 'Owner account' })
  updatePreferences(
    @CurrentSession() session: AuthSession,
    @Body({ schema: UpdatePreferencesInputSchema }) input: UpdatePreferencesInput,
  ): Promise<Preferences> {
    return this.me.savePreferences(session.user.id, input);
  }
}
