import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AuthForm } from './auth-form';

describe('AuthForm', () => {
  it('shows accessible field errors and does not submit invalid input', async () => {
    const onSubmit = vi.fn();
    render(<AuthForm mode="sign-up" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));

    const email = screen.getByLabelText('Email');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Enter a valid email address');
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(
      'Use at least 12 characters',
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits valid sign-in values', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AuthForm mode="sign-in" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(onSubmit).toHaveBeenCalledWith({ email: 'ada@example.com', password: 'secret' });
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('announces a server error', async () => {
    render(
      <AuthForm mode="sign-in" onSubmit={() => Promise.resolve('Invalid email or password')} />,
    );

    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });
});
