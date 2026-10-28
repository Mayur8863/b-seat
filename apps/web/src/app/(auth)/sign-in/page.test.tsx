import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { replace, search } = vi.hoisted(() => ({
  replace: vi.fn(),
  search: { value: '' },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useSearchParams: () => new URLSearchParams(search.value),
}));

import type * as AuthClientModule from '@/lib/auth-client';

const sessionStub = vi.hoisted((): { value: unknown } => ({ value: undefined }));
// Real client for HTTP calls (MSW); only the session hook can be stubbed.
vi.mock('@/lib/auth-client', async (importOriginal) => {
  const { authClient: real } = await importOriginal<typeof AuthClientModule>();
  return {
    authClient: new Proxy(real, {
      get: (target, key, receiver): unknown =>
        key === 'useSession' && sessionStub.value
          ? () => sessionStub.value
          : Reflect.get(target, key, receiver),
    }),
  };
});

import { renderWithQuery } from '@/test/render';

import SignInPage from './page';

const session = { session: { id: 's' }, user: { id: 'u1', name: 'Ada', email: 'a@example.com' } };

/** Stubs the session hook: the Better Auth session atom is module-global and would leak between tests. */
function sessionIs(user: { id: string } | null) {
  sessionStub.value = {
    data: user ? { session: { id: 's' }, user } : null,
    isPending: false,
    isRefetching: false,
    error: null,
    refetch: () => Promise.resolve(),
  };
}

describe('SignInPage', () => {
  beforeEach(() => {
    replace.mockReset();
    sessionStub.value = undefined;
    search.value = '';
  });

  it('redirects a signed-in user to the safe next path', async () => {
    search.value = 'next=/find';
    sessionIs(session.user);
    renderWithQuery(<SignInPage />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/find');
    });
  });

  it('falls back to the dashboard for an unsafe next', async () => {
    search.value = 'next=//example.com';
    sessionIs(session.user);
    renderWithQuery(<SignInPage />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('shows the form without redirecting on a stale cookie', async () => {
    sessionIs(null);
    renderWithQuery(<SignInPage />);
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(replace).not.toHaveBeenCalled();
  });
});
