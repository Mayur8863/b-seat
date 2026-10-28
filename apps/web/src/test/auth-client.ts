import type { authClient as AuthClient } from '@/lib/auth-client';

/** Holds the stubbed session; undefined means "use the real hook". */
export const sessionStub: { value: unknown } = { value: undefined };

/**
 * Wraps the real auth client so HTTP calls still reach MSW while `useSession` can be stubbed.
 * Use from a `vi.mock('@/lib/auth-client', ...)` factory.
 */
export function stubAuthClient(real: typeof AuthClient): typeof AuthClient {
  return new Proxy(real, {
    get: (target, key, receiver): unknown =>
      key === 'useSession' && sessionStub.value
        ? () => sessionStub.value
        : Reflect.get(target, key, receiver),
  });
}

/** The Better Auth session atom is module-global and would leak between tests, hence the stub. */
export function sessionIs(user: { id: string } | null) {
  sessionStub.value = {
    data: user ? { session: { id: 's' }, user } : null,
    isPending: false,
    isRefetching: false,
    error: null,
    refetch: () => Promise.resolve(),
  };
}
