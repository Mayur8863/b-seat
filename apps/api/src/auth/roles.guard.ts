import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import type { AuthSession } from './auth.js';

export type AccountType = 'owner' | 'renter';

const ROLE_KEY = 'bseat:required-role';

/** Restricts a handler or controller to one account type. Use after AuthGuard. */
export const RequireRole = (role: AccountType) => SetMetadata(ROLE_KEY, role);

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
    const session = context
      .switchToHttp()
      .getRequest<Request & { session?: AuthSession }>().session;
    if (!session) throw new UnauthorizedException('Sign in required');
    if (session.user.accountType !== required) {
      throw new ForbiddenException('This action is not available for your account type');
    }
    return true;
  }
}
