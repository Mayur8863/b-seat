import { ApiError } from '@bseat/api-client';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProblemAlert } from './problem-alert';

let pathname: string | null = null;
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

function problem(status: number, type: string, detail?: string) {
  return new ApiError(status, { type: `urn:bseat:problem:${type}`, title: 't', status, detail });
}

describe('ProblemAlert', () => {
  it('renders a role=alert with the mapped title and description', () => {
    render(<ProblemAlert error={problem(500, 'http-500')} action="book" />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong');
    expect(alert).toHaveTextContent("We couldn't complete that. Try again in a moment.");
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('uses the caller fallback title for generic outcomes only', () => {
    const context = { fallbackTitle: 'Custom' };
    const { rerender } = render(
      <ProblemAlert error={problem(500, 'http-500')} action="availability" context={context} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Custom');

    rerender(
      <ProblemAlert error={problem(404, 'http-404')} action="availability" context={context} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Office space not found');
  });

  it('defaults the sign-in next path to the current page', () => {
    pathname = '/book';
    render(<ProblemAlert error={problem(401, 'http-401')} action="book" />);
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in?next=%2Fbook',
    );
  });

  it('renders inline links from the copy', () => {
    render(<ProblemAlert error={problem(409, 'booking:user-overlap')} action="book" />);
    expect(screen.getByRole('link', { name: 'My bookings' })).toHaveAttribute('href', '/bookings');
  });

  it('links to sign-in with the current path when the session ended', () => {
    render(
      <ProblemAlert error={problem(401, 'http-401')} action="book" context={{ path: '/book' }} />,
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in?next=%2Fbook',
    );
  });

  it('calls onRetry from the Try again button', async () => {
    const onRetry = vi.fn();
    render(<ProblemAlert error={problem(500, 'http-500')} action="book" onRetry={onRetry} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('says it could not reach BSeat for a non-API error', () => {
    render(<ProblemAlert error={new TypeError('network')} action="book" />);
    expect(screen.getByRole('alert')).toHaveTextContent("We couldn't reach BSeat");
  });

  it('prefers an explicit context path over the current page', () => {
    pathname = '/book';
    render(
      <ProblemAlert
        error={problem(401, 'http-401')}
        action="book"
        context={{ path: '/bookings' }}
      />,
    );
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in?next=%2Fbookings',
    );
  });
});
