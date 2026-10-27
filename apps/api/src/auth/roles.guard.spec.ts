import { type ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { AuthGuard } from './auth.guard.js';
import { attachSession } from './request-session.js';
import { RequireRole, RolesGuard } from './roles.guard.js';

class Probe {
  @RequireRole('owner')
  ownerOnly() {
    return 'ran';
  }

  open() {
    return 'ran';
  }
}

function context(handler: () => unknown, session?: { user: { accountType: string } }) {
  const req = {};
  if (session) attachSession(req as never, session as never);
  return {
    getHandler: () => handler,
    getClass: () => Probe,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const guard = new RolesGuard(new Reflector());

describe('RequireRole', () => {
  it('applies AuthGuard then RolesGuard so the role cannot be set without the guards', () => {
    const guards: unknown = Reflect.getMetadata('__guards__', Probe.prototype.ownerOnly);
    expect(guards).toEqual([AuthGuard, RolesGuard]);
  });
});

describe('RolesGuard', () => {
  it('lets an owner into an owner-only handler', () => {
    const ctx = context(Probe.prototype.ownerOnly, { user: { accountType: 'owner' } });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('answers 403 for a renter on an owner-only handler', () => {
    const ctx = context(Probe.prototype.ownerOnly, { user: { accountType: 'renter' } });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('ignores a foreign req.session (401)', () => {
    const ctx = {
      getHandler: () => Probe.prototype.ownerOnly,
      getClass: () => Probe,
      switchToHttp: () => ({ getRequest: () => ({ session: { user: { accountType: 'owner' } } }) }),
    } as unknown as ExecutionContext;
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });

  it('answers 401 when AuthGuard did not run first', () => {
    expect(() => guard.canActivate(context(Probe.prototype.ownerOnly))).toThrow(
      UnauthorizedException,
    );
  });

  it('allows handlers without a role requirement', () => {
    const ctx = context(Probe.prototype.open, { user: { accountType: 'renter' } });
    expect(guard.canActivate(ctx)).toBe(true);
  });
});
