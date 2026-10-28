import type { OwnerSeat } from '@bseat/api-client';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { OccupancyConflicts } from './occupancy-conflicts';
import { SeatState } from './seat-state';

const booked: OwnerSeat = {
  id: 's',
  label: 'A-1',
  features: [],
  cubicle: null,
  calendar: 'shared',
  today: { state: 'booked', note: null, markId: null },
};

describe('SeatState', () => {
  it('links to bookings only when the page exists', () => {
    const { rerender } = render(<SeatState seat={booked} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    rerender(<SeatState seat={booked} bookingsHref="/owner/spaces/s1/bookings" />);
    expect(screen.getByRole('link', { name: 'See bookings for seat A-1' })).toHaveAttribute(
      'href',
      '/owner/spaces/s1/bookings',
    );
  });
});

describe('SeatState calendar badge', () => {
  it('shows "Own calendar" only for seats on their own calendar', () => {
    const { rerender } = render(<SeatState seat={booked} />);
    expect(screen.queryByText('Own calendar')).not.toBeInTheDocument();
    rerender(<SeatState seat={{ ...booked, calendar: 'own' }} />);
    expect(screen.getByText('Own calendar')).toBeInTheDocument();
  });
});

describe('OccupancyConflicts', () => {
  it('caps seats and date ranges', () => {
    const dates = Array.from(
      { length: 16 },
      (_, i) => `2026-11-${String(1 + i * 2).padStart(2, '0')}`,
    ).slice(0, 8);
    const conflicts = Array.from({ length: 12 }, (_, i) => ({
      seatId: `s${i}`,
      label: `S-${i}`,
      bookedDates: i === 0 ? dates : [],
      marks: [],
    }));
    render(<OccupancyConflicts conflicts={conflicts} now={new Date('2026-10-28')} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(11);
    expect(screen.getByText('and 2 more seats')).toBeInTheDocument();
    expect(screen.getByText(/and 2 more days/)).toBeInTheDocument();
  });
});
