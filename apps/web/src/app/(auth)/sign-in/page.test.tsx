import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
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
import { sessionIs, sessionStub } from '@/test/auth-client';

vi.mock('@/lib/auth-client', async (importOriginal) => {
  const { stubAuthClient: stub } = await import('@/test/auth-client');
  const { authClient } = await importOriginal<typeof AuthClientModule>();
  return { authClient: stub(authClient) };
});

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import SignInPage from './page';

const session = { session: { id: 's' }, user: { id: 'u1', name: 'Ada', email: 'a@example.com' } };

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

  it.each([
    ['INVALID_EMAIL_OR_PASSWORD', 'Email or password is incorrect.'],
    ['EMAIL_NOT_VERIFIED', 'Confirm your email address, then sign in.'],
    ['BOOM', "We couldn't sign you in. Try again."],
  ])('maps %s to a fixed message, never the raw server text', async (code, message) => {
    sessionIs(null);
    server.use(
      http.post('*/api/auth/sign-in/email', () =>
        HttpResponse.json({ code, message: 'raw server text' }, { status: 401 }),
      ),
    );
    renderWithQuery(<SignInPage />);
    await userEvent.type(await screen.findByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'whatever-password');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(message);
    expect(alert).not.toHaveTextContent('raw server text');
  });
});
