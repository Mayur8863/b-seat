import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signUpEmail, push } = vi.hoisted(() => ({
  signUpEmail: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/lib/auth-client', () => ({ authClient: { signUp: { email: signUpEmail } } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

import SignUpPage from './page';

describe('SignUpPage', () => {
  beforeEach(() => {
    signUpEmail.mockReset().mockResolvedValue({ error: null });
    push.mockReset();
  });

  it('sends accountType renter with the form values, then goes to the dashboard', async () => {
    render(<SignUpPage />);

    await userEvent.type(screen.getByLabelText('Name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(signUpEmail).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'correct-horse-battery',
      accountType: 'renter',
    });
    expect(push).toHaveBeenCalledWith('/dashboard');
  });
});
