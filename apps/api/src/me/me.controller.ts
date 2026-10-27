import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { z } from 'zod';

import type { AuthSession } from '../auth/auth.js';
import { AuthGuard, CurrentSession } from '../auth/auth.guard.js';
import { ProblemSchema } from '../common/errors/problem.js';

export const MeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    accountType: z.enum(['owner', 'renter']),
  })
  .meta({ id: 'Me', description: 'The signed-in user' });

export type Me = z.infer<typeof MeSchema>;

@ApiTags('me')
@ApiCookieAuth()
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  @Get()
  @ApiOkResponse({ standardSchema: MeSchema })
  @ApiUnauthorizedResponse({ standardSchema: ProblemSchema })
  get(@CurrentSession() session: AuthSession): Me {
    const { id, name, email, emailVerified, accountType } = session.user;
    return { id, name, email, emailVerified, accountType };
  }
}
