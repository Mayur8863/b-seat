import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';

import type { Auth, AuthSession } from './auth.js';
import { attachSession, getAttachedSession } from './request-session.js';
import { AUTH } from './auth.tokens.js';

/**
 * Requires a valid Better Auth session cookie. Use with `@UseGuards(AuthGuard)`
 * and read the user via `@CurrentSession()`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    // Idempotent: RequireRole applies AuthGuard itself, so a class-level guard may have run already.
    if (getAttachedSession(req)) return true;
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) throw new UnauthorizedException('Sign in required');
    attachSession(req, session);
    return true;
  }
}

/** The session attached by AuthGuard. */
export const CurrentSession = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthSession => {
    const session = getAttachedSession(context.switchToHttp().getRequest<Request>());
    if (!session) throw new UnauthorizedException('Sign in required');
    return session;
  },
);
