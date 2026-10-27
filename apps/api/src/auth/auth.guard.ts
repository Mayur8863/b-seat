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
import { AUTH } from './auth.tokens.js';

export type AuthedRequest = Request & { session?: AuthSession };

/**
 * Requires a valid Better Auth session cookie. Use with `@UseGuards(AuthGuard)`
 * and read the user via `@CurrentSession()`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!session) throw new UnauthorizedException('Sign in required');
    req.session = session;
    return true;
  }
}

/** The session attached by AuthGuard. */
export const CurrentSession = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthSession => {
    const session = context.switchToHttp().getRequest<AuthedRequest>().session;
    if (!session) throw new UnauthorizedException('Sign in required');
    return session;
  },
);
