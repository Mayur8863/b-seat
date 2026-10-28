import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithQuery } from '@/test/render';

import { SignOutButton } from './sign-out-button';

const push = vi.fn();
const signOut = vi.fn<() => Promise<{ error: unknown }>>();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/auth-client', () => ({ authClient: { signOut: () => signOut() } }));

describe('SignOutButton', () => {
  beforeEach(() => {
    push.mockClear();
    signOut.mockReset();
  });

  it('redirects to sign-in on success', async () => {
    signOut.mockResolvedValue({ error: null });
    renderWithQuery(<SignOutButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/sign-in');
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['an error result', () => signOut.mockResolvedValue({ error: { message: 'x' } })],
    ['a rejected promise', () => signOut.mockRejectedValue(new Error('network'))],
  ])('shows an alert and stays on the page on %s', async (_name, arrange) => {
    arrange();
    renderWithQuery(<SignOutButton />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t sign you out/i);
    expect(push).not.toHaveBeenCalled();
  });
});
