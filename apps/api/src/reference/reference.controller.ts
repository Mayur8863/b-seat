import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

import { AuthGuard } from '../auth/auth.guard.js';
import { ProblemSchema } from '../common/errors/problem.js';
import { REFERENCE } from './reference-data.js';
import { type Reference, ReferenceSchema } from './reference.schemas.js';

@ApiTags('reference')
@ApiCookieAuth()
@Controller('reference')
@UseGuards(AuthGuard)
export class ReferenceController {
  @Get()
  @Header('Cache-Control', 'private, max-age=3600')
  @ApiOkResponse({ standardSchema: ReferenceSchema })
  @ApiUnauthorizedResponse({ standardSchema: ProblemSchema })
  get(): Reference {
    return REFERENCE;
  }
}
