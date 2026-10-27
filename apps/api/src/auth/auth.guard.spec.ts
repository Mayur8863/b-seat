import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it, vi } from 'vitest';

import type { Auth } from './auth.js';
import { AuthGuard, CurrentSession } from './auth.guard.js';

function context(req: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

function guardWith(session: unknown) {
  const auth = { api: { getSession: vi.fn().mockResolvedValue(session) } } as unknown as Auth;
  return new AuthGuard(auth);
}

/** Extracts the factory behind a createParamDecorator() decorator. */
function paramFactory(decorator: () => ParameterDecorator) {
  class Probe {
    handler(@decorator() _value: unknown) {
      /* metadata probe only */
    }
  }
  const meta = Reflect.getMetadata(ROUTE_ARGS_METADATA, Probe, 'handler') as Record<
    string,
    { factory: (data: unknown, ctx: ExecutionContext) => unknown }
  >;
  return Object.values(meta)[0]!.factory;
}

describe('AuthGuard', () => {
  it('attaches the session when signed in', async () => {
    const req: Record<string, unknown> = { headers: { cookie: 'x' } };
    const session = { user: { id: 'u1' } };
    await expect(guardWith(session).canActivate(context(req))).resolves.toBe(true);
    expect(req.session).toBe(session);
  });

  it('returns early without refetching when a session is already attached', async () => {
    const req: Record<string, unknown> = { headers: {}, session: { user: { id: 'u1' } } };
    const auth = { api: { getSession: vi.fn() } } as unknown as Auth;
    await expect(new AuthGuard(auth).canActivate(context(req))).resolves.toBe(true);
    expect(auth.api.getSession).not.toHaveBeenCalled();
  });

  it('rejects anonymous requests with 401', async () => {
    await expect(guardWith(null).canActivate(context({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('CurrentSession', () => {
  const factory = paramFactory(CurrentSession);

  it('returns the session set by the guard', () => {
    const session = { user: { id: 'u1' } };
    expect(factory(undefined, context({ session }))).toBe(session);
  });

  it('throws when used without the guard', () => {
    expect(() => factory(undefined, context({}))).toThrow(UnauthorizedException);
  });
});
