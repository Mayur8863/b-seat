import { getReferenceGetMockHandler } from '@bseat/api-client/mocks';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }) }));
vi.mock('@bseat/ui/components/sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from '@bseat/ui/components/sonner';

import type * as AuthClientModule from '@/lib/auth-client';
import { sessionIs, sessionStub } from '@/test/auth-client';

vi.mock('@/lib/auth-client', async (importOriginal) => {
  const { stubAuthClient: stub } = await import('@/test/auth-client');
  const { authClient } = await importOriginal<typeof AuthClientModule>();
  return { authClient: stub(authClient) };
});

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import SignUpPage from './page';

const user = { id: 'u1', name: 'Ada', email: 'ada@example.com', emailVerified: false };
const reference = getReferenceGetMockHandler({
  countries: [{ code: 'IN', name: 'India', timeZones: ['Asia/Kolkata'] }],
  currencies: [],
  utilities: [],
});

function noSession() {
  server.use(http.get('*/api/auth/get-session', () => HttpResponse.json(null)));
}

function signUpReturns(response: Response | (() => Response)) {
  const bodies: unknown[] = [];
  server.use(
    http.post('*/api/auth/sign-up/email', async ({ request }) => {
      bodies.push(await request.json());
      return typeof response === 'function' ? response() : response;
    }),
  );
  return bodies;
}

async function fill(role: RegExp | null) {
  await userEvent.type(screen.getByLabelText('Name'), 'Ada');
  await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
  await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
  if (role) await userEvent.click(screen.getByRole('radio', { name: role }));
  await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
}

describe('SignUpPage', () => {
  beforeEach(() => {
    push.mockReset();
    sessionStub.value = undefined;
    replace.mockReset();
    vi.mocked(toast.success).mockReset();
    vi.mocked(toast.error).mockReset();
    noSession();
  });

  it('without a role shows the field error and sends no request', async () => {
    const bodies = signUpReturns(HttpResponse.json({ token: 't', user }));
    renderWithQuery(<SignUpPage />);
    await fill(null);
    expect(await screen.findByRole('radiogroup')).toHaveAccessibleDescription(
      'Choose whether you own a space or need one',
    );
    expect(bodies).toHaveLength(0);
  });

  it('owner: sends accountType owner, no preferences step, goes to the dashboard', async () => {
    const bodies = signUpReturns(HttpResponse.json({ token: 't', user }));
    renderWithQuery(<SignUpPage />);
    await fill(/I own a space/);
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/dashboard');
    });
    expect(bodies).toEqual([
      expect.objectContaining({ email: 'ada@example.com', accountType: 'owner' }),
    ]);
    expect(screen.queryByText('Where do you want a space?')).not.toBeInTheDocument();
  });

  it('renter: sends accountType renter, shows the preferences step, saves them', async () => {
    sessionIs(null);
    // The sign-up call creates a session; the stubbed hook then reports it, as the real one would.
    const bodies = signUpReturns(() => {
      sessionIs(user);
      return HttpResponse.json({ token: 't', user });
    });
    const saved: unknown[] = [];
    server.use(
      reference,
      http.put('*/api/me/preferences', async ({ request }) => {
        saved.push(await request.json());
        return HttpResponse.json({ country: 'IN', city: 'Pune', area: null });
      }),
    );
    renderWithQuery(<SignUpPage />);
    await fill(/I need a space/);
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Where do you want a space?' });
    await waitFor(() => {
      expect(h1).toHaveFocus();
    });
    expect(bodies).toEqual([expect.objectContaining({ accountType: 'renter' })]);
    // The new session must not trigger the "already signed in" redirect away from this step.
    expect(replace).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByLabelText('Country')).toBeEnabled();
    });
    await userEvent.selectOptions(screen.getByLabelText('Country'), 'IN');
    await userEvent.type(screen.getByLabelText('City'), 'Pune');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/dashboard');
    });
    expect(saved).toEqual([{ country: 'IN', city: 'Pune', area: null }]);
    expect(toast.success).toHaveBeenCalledWith('Preferences saved');
  });

  it('renter: Skip for now goes to the dashboard without saving', async () => {
    signUpReturns(HttpResponse.json({ token: 't', user }));
    server.use(reference);
    renderWithQuery(<SignUpPage />);
    await fill(/I need a space/);
    await userEvent.click(await screen.findByRole('button', { name: 'Skip for now' }));
    expect(push).toHaveBeenCalledWith('/dashboard');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('renter: a failed preferences save is non-blocking', async () => {
    signUpReturns(HttpResponse.json({ token: 't', user }));
    server.use(
      reference,
      http.put('*/api/me/preferences', () => HttpResponse.json({ status: 500 }, { status: 500 })),
    );
    renderWithQuery(<SignUpPage />);
    await fill(/I need a space/);
    await userEvent.type(await screen.findByLabelText('City'), 'Pune');
    await userEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/dashboard');
    });
    expect(toast.error).toHaveBeenCalledWith(
      "Your account is ready, but we couldn't save your preferences. Add them from your dashboard.",
    );
  });

  it('without a session shows "Check your email" and no preferences step', async () => {
    signUpReturns(HttpResponse.json({ token: null, user }));
    renderWithQuery(<SignUpPage />);
    await fill(/I need a space/);
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Check your email' });
    await waitFor(() => {
      expect(h1).toHaveFocus();
    });
    expect(screen.getByText(/We sent a link to ada@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/you can add your preferred location/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/sign-in');
    expect(push).not.toHaveBeenCalled();
  });

  it('maps an existing account to a form alert with a Sign in link', async () => {
    signUpReturns(
      HttpResponse.json(
        { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: 'raw server text' },
        { status: 422 },
      ),
    );
    renderWithQuery(<SignUpPage />);
    await fill(/I own a space/);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('An account with this email already exists.');
    expect(alert).not.toHaveTextContent('raw server text');
    expect(push).not.toHaveBeenCalled();
  });

  it('maps a server role error to the role field', async () => {
    signUpReturns(HttpResponse.json({ code: 'MISSING_FIELD', message: 'x' }, { status: 400 }));
    renderWithQuery(<SignUpPage />);
    await fill(/I own a space/);
    expect(await screen.findByRole('radiogroup')).toHaveAccessibleDescription(
      'Choose whether you own a space or need one',
    );
  });

  it('maps any other failure to a generic alert', async () => {
    signUpReturns(HttpResponse.json({ code: 'BOOM', message: 'secret' }, { status: 500 }));
    renderWithQuery(<SignUpPage />);
    await fill(/I own a space/);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "We couldn't create your account. Try again.",
    );
  });

  it('redirects a server-validated session to the dashboard', async () => {
    sessionIs(user);
    renderWithQuery(<SignUpPage />);
    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('does not redirect on a stale cookie (no session)', async () => {
    sessionIs(null);
    renderWithQuery(<SignUpPage />);
    expect(await screen.findByRole('heading', { name: 'Create your account' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(replace).not.toHaveBeenCalled();
  });
});
