import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@bseat/api-client';

import { londonAvailability } from '@/test/fixtures';

import { SeatAvailability } from './seat-availability';

const base = {
  requested: true,
  loading: false,
  error: null,
  stale: false,
  onRetry: vi.fn(),
};

describe('SeatAvailability', () => {
  it('has an empty status region before the first request', () => {
    render(<SeatAvailability {...base} requested={false} />);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it('shows skeletons and a loading status while loading', () => {
    render(<SeatAvailability {...base} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading seats…');
    expect(screen.getByRole('heading', { name: 'Seats' }).closest('section')).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('shows six seats, five free and one taken, in text, with the space time zone', () => {
    render(<SeatAvailability {...base} data={londonAvailability} />);

    expect(screen.getByRole('status')).toHaveTextContent('5 of 6 seats free.');
    expect(
      screen.getByText('London HQ · Fri 23 Oct 2026, 09:00–17:00 (Europe/London)'),
    ).toBeVisible();
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getAllByText('Free')).toHaveLength(5);
    expect(screen.getAllByText('Taken')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'A-01 Taken' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'A-02 Free' })).toBeEnabled();
    const features = screen.getByRole('radio', { name: 'A-02 Free' });
    expect(features).toHaveAccessibleDescription(/standing desk\s*dual monitor/);
  });

  it('selects a free seat with the mouse and moves between free seats with arrow keys', async () => {
    const user = userEvent.setup();
    render(<SeatAvailability {...base} data={londonAvailability} />);

    await user.click(screen.getByRole('radio', { name: 'A-02 Free' }));
    expect(screen.getByRole('radio', { name: 'A-02 Free' })).toBeChecked();

    // Radix moves focus on a timer, so the key is held until focus lands (as in a browser).
    await user.keyboard('{ArrowRight>}');
    await waitFor(() => expect(screen.getByRole('radio', { name: 'A-03 Free' })).toHaveFocus());
    await user.keyboard('{/ArrowRight}');
    expect(screen.getByRole('radio', { name: 'A-03 Free' })).toBeChecked();

    await user.keyboard('{ArrowLeft>}');
    await waitFor(() => expect(screen.getByRole('radio', { name: 'A-02 Free' })).toHaveFocus());
    await user.keyboard('{/ArrowLeft}');
    await user.keyboard('{ArrowLeft>}');
    // A-01 is taken, so focus wraps past it to the last free seat.
    await waitFor(() => expect(screen.getByRole('radio', { name: 'A-06 Free' })).toHaveFocus());
    await user.keyboard('{/ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'A-06 Free' })).toBeChecked();
  });

  it('shows the stale note when the form no longer matches', () => {
    render(<SeatAvailability {...base} data={londonAvailability} stale />);
    expect(
      screen.getByText('You changed the details. Select Show seats to update the seats.'),
    ).toBeInTheDocument();
  });

  it('shows an empty message when the space has no seats', () => {
    render(<SeatAvailability {...base} data={{ ...londonAvailability, seats: [] }} />);
    expect(screen.getByRole('status')).toHaveTextContent('This space has no seats yet.');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('suggests another time when every seat is taken', () => {
    const allTaken = {
      ...londonAvailability,
      seats: londonAvailability.seats.map((seat) => ({ ...seat, status: 'taken' as const })),
    };
    render(<SeatAvailability {...base} data={allTaken} />);
    expect(screen.getByRole('status')).toHaveTextContent('0 of 6 seats free.');
    expect(screen.getByText('Try a different time or another space.')).toBeInTheDocument();
  });

  it('shows an error alert with retry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const error = new ApiError(404, {
      type: 'urn:bseat:problem:http-404',
      title: 'Not found',
      status: 404,
    });
    render(<SeatAvailability {...base} error={error} onRetry={onRetry} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("We couldn't load seats");
    expect(alert).toHaveTextContent('This space is no longer available.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
