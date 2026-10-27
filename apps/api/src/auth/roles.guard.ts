import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { AccountType } from './account-type.js';
import { AuthGuard } from './auth.guard.js';
import { getAttachedSession } from './request-session.js';

export type { AccountType } from './account-type.js';

const ROLE_KEY = 'bseat:required-role';

/**
 * Restricts a handler or controller to one account type. It applies AuthGuard and RolesGuard
 * itself, so a route cannot carry the role without the check (fail closed, OWASP A01).
 * Handler-level metadata overrides class-level metadata (`getAllAndOverride`).
 */
export const RequireRole = (role: AccountType) =>
  applyDecorators(UseGuards(AuthGuard, RolesGuard), SetMetadata(ROLE_KEY, role));

/**
 * Enforces `@RequireRole()` from the session set by AuthGuard. The wrong role gets 403,
 * which reveals nothing about any particular resource (ADR-0010).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AccountType | undefined>(ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    const session = getAttachedSession(context.switchToHttp().getRequest<Request>());
    if (!session) throw new UnauthorizedException('Sign in required');
    if (session.user.accountType !== required) {
      throw new ForbiddenException('This action is not available for your account type');
    }
    return true;
  }
}
