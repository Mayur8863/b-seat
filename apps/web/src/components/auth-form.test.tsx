import { render, screen, waitFor } from '@testing-library/react';
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
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveAttribute('aria-invalid', 'true');
    expect(group).toHaveAccessibleDescription('Choose whether you own a space or need one');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('sign-up: nothing is preselected and the role group is labelled "I want to"', () => {
    render(<AuthForm mode="sign-up" onSubmit={vi.fn()} />);
    expect(screen.getByRole('group', { name: 'I want to' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /I own a space/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /I need a space/ })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: /I own a space/ })).toHaveAccessibleDescription(
      'List seats and passes for renters to book.',
    );
  });

  it('sign-up: the role is operable by keyboard and is submitted', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AuthForm mode="sign-up" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: /I own a space/ })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('radio', { name: /I need a space/ })).toHaveFocus();
    await userEvent.keyboard(' ');
    expect(screen.getByRole('radio', { name: /I need a space/ })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'correct-horse-battery',
      accountType: 'renter',
    });
  });

  it('sign-up: a server role error lands on the role field', async () => {
    render(
      <AuthForm mode="sign-up" onSubmit={() => Promise.resolve({ accountType: 'Pick a role' })} />,
    );
    await userEvent.type(screen.getByLabelText('Name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await userEvent.click(screen.getByRole('radio', { name: /I own a space/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('radiogroup')).toHaveAccessibleDescription('Pick a role');
  });

  it('sign-up: an existing-account failure offers a Sign in link', async () => {
    render(
      <AuthForm
        mode="sign-up"
        onSubmit={() =>
          Promise.resolve({ form: 'An account with this email already exists.', signInLink: true })
        }
      />,
    );
    await userEvent.type(screen.getByLabelText('Name'), 'Ada');
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await userEvent.click(screen.getByRole('radio', { name: /I need a space/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
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

  it('disables every field while submitting', async () => {
    let finish: () => void = () => undefined;
    const onSubmit = vi.fn(
      () =>
        new Promise<undefined>((r) => {
          finish = () => {
            r(undefined);
          };
        }),
    );
    render(<AuthForm mode="sign-in" onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Email'), 'ada@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'whatever');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByLabelText('Email')).toBeDisabled();
    expect(screen.getByLabelText('Password')).toBeDisabled();
    finish();
    await waitFor(() => {
      expect(screen.getByLabelText('Email')).toBeEnabled();
    });
  });
});
