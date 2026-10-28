import type { Booking } from '@bseat/api-client';
import {
  getBookingsCancelMockHandler,
  getBookingsListMineMockHandler,
} from '@bseat/api-client/mocks';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@bseat/ui/components/sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from '@bseat/ui/components/sonner';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { MyBookings } from './my-bookings';
import { NextBooking } from './next-booking';

const future = new Date(Date.now() + 3 * 86_400_000).toISOString();
const later = new Date(Date.now() + 9 * 86_400_000).toISOString();
const past = new Date(Date.now() - 3_600_000).toISOString();

const booking = (id: string, name: string, over: Partial<Booking> = {}): Booking => ({
  id,
  status: 'active',
  pass: 'week',
  slot: 'working_hours',
  startDate: '2026-11-03',
  endDate: '2026-11-09',
  timeZone: 'Asia/Kolkata',
  slotTimes: { startTime: '09:00', endTime: '18:00', endsNextDay: false },
  firstStartsAt: future,
  lastEndsAt: later,
  days: [],
  skippedDates: ['2026-11-07'],
  seat: { id: 's1', label: 'A1', cubicleName: null },
  space: { id: 'sp1', name, area: 'Indiranagar', city: 'Bengaluru', country: 'IN' },
  price: { amount: '3000.00', currency: 'INR' },
  createdAt: future,
  cancelledAt: null,
  ...over,
});

const problem = (status: number, type: string) =>
  HttpResponse.json({ type: `urn:bseat:problem:${type}`, title: 't', status }, { status });

describe('MyBookings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a busy loading state', () => {
    server.use(http.get('*/api/bookings', () => new Promise(() => undefined)));
    renderWithQuery(<MyBookings />);
    expect(screen.getByRole('heading', { level: 1, name: 'My bookings' })).toBeInTheDocument();
    expect(screen.getByText('Loading your bookings…')).toBeInTheDocument();
  });

  it('shows the empty state with a link to search', async () => {
    server.use(getBookingsListMineMockHandler({ items: [] }));
    renderWithQuery(<MyBookings />);
    expect(await screen.findByText('You have no upcoming bookings.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find a space' })).toHaveAttribute('href', '/find');
  });

  it('says so when the list is at the 50 cap', async () => {
    server.use(
      getBookingsListMineMockHandler({
        items: Array.from({ length: 50 }, (_, n) => booking(`b${n}`, `Hub ${n}`)),
      }),
    );
    renderWithQuery(<MyBookings />);
    expect(await screen.findByText(/Showing your next 50 bookings/)).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    let calls = 0;
    server.use(
      http.get('*/api/bookings', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ status: 500 }, { status: 500 })
          : HttpResponse.json({ items: [] });
      }),
    );
    renderWithQuery(<MyBookings />);
    expect(await screen.findByText("We couldn't load your bookings")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('You have no upcoming bookings.')).toBeInTheDocument();
  });

  it('lists bookings in API order with details; in-progress has no cancel button', async () => {
    server.use(
      getBookingsListMineMockHandler({
        items: [booking('b1', 'Alpha Hub', { firstStartsAt: past }), booking('b2', 'Beta Hub')],
      }),
    );
    renderWithQuery(<MyBookings />);
    const cards = await screen.findAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(within(cards[0]!).getByRole('heading', { name: 'Alpha Hub' })).toBeInTheDocument();
    expect(within(cards[0]!).getByText('In progress')).toBeInTheDocument();
    expect(within(cards[0]!).getByText("Started. It can't be cancelled.")).toBeInTheDocument();
    expect(within(cards[0]!).queryByRole('button')).not.toBeInTheDocument();
    expect(within(cards[1]!).getByText('Upcoming')).toBeInTheDocument();
    expect(within(cards[1]!).getByText('₹3,000.00')).toBeInTheDocument();
    expect(within(cards[1]!).getByText('Sat 7 Nov 2026')).toBeInTheDocument();
    expect(
      within(cards[1]!).getAllByText(/\(Asia\/Kolkata\)/, { selector: 'dd' })[0],
    ).toBeInTheDocument();
    expect(within(cards[1]!).getByRole('button', { name: /Cancel booking/ })).toBeInTheDocument();
  });

  it('cancels after confirmation, refetches and moves focus to the next card', async () => {
    let cancelled = false;
    const cancelledIds: string[] = [];
    server.use(
      http.get('*/api/bookings', () =>
        HttpResponse.json({
          items: cancelled
            ? [booking('b2', 'Beta Hub')]
            : [booking('b1', 'Alpha Hub'), booking('b2', 'Beta Hub')],
        }),
      ),
      getBookingsCancelMockHandler((info) => {
        cancelled = true;
        cancelledIds.push(String(info.params.bookingId));
        return booking('b1', 'Alpha Hub', { status: 'cancelled' });
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<MyBookings />);
    const first = (await screen.findAllByRole('button', { name: /Cancel booking/ }))[0]!;
    await user.click(first);
    const dialog = await screen.findByRole('alertdialog', { name: 'Cancel this booking?' });
    expect(within(dialog).getByRole('button', { name: 'Keep booking' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel booking' }));
    await waitFor(() => {
      expect(screen.queryByText('Alpha Hub')).not.toBeInTheDocument();
    });
    expect(cancelledIds).toEqual(['b1']);
    expect(toast.success).toHaveBeenCalledWith('Booking cancelled');
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Beta Hub' })).toHaveFocus();
    });
    expect(screen.getByRole('status', { name: '' })).toBeDefined();
  });

  it('shows the already-started alert and refetches on 409', async () => {
    let started = false;
    server.use(
      http.get('*/api/bookings', () =>
        HttpResponse.json({
          items: [booking('b1', 'Alpha Hub', started ? { firstStartsAt: past } : {})],
        }),
      ),
      http.post('*/api/bookings/b1/cancel', () => {
        started = true;
        return problem(409, 'booking:already-started');
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<MyBookings />);
    await user.click(await screen.findByRole('button', { name: /Cancel booking/ }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel booking' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This booking has already started');
    await waitFor(() => {
      expect(screen.getByText('In progress')).toBeInTheDocument();
    });
  });

  it('shows the not-found alert on 404', async () => {
    server.use(
      getBookingsListMineMockHandler({ items: [booking('b1', 'Alpha Hub')] }),
      http.post('*/api/bookings/b1/cancel', () => problem(404, 'not-found')),
    );
    const user = userEvent.setup();
    renderWithQuery(<MyBookings />);
    await user.click(await screen.findByRole('button', { name: /Cancel booking/ }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel booking' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't find that booking");
  });
});

describe('NextBooking', () => {
  it('summarises the next booking and links to My bookings', async () => {
    server.use(getBookingsListMineMockHandler({ items: [booking('b1', 'Alpha Hub')] }));
    renderWithQuery(<NextBooking />);
    expect(await screen.findByText('Alpha Hub')).toBeInTheDocument();
    expect(screen.getByText(/^Starts /)).toBeInTheDocument();
    expect(screen.getByText('Seat A1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View booking' })).toHaveAttribute('href', '/bookings');
  });

  it('says Started for an in-progress booking', async () => {
    server.use(
      getBookingsListMineMockHandler({
        items: [booking('b1', 'Alpha Hub', { firstStartsAt: past })],
      }),
    );
    renderWithQuery(<NextBooking />);
    expect(await screen.findByText(/^Started /)).toBeInTheDocument();
  });

  it('shows loading, empty and error states', async () => {
    server.use(
      http.get('*/api/bookings', () => HttpResponse.json({ status: 500 }, { status: 500 })),
    );
    renderWithQuery(<NextBooking />);
    expect(screen.getByText('Loading your next booking…')).toBeInTheDocument();
    expect(await screen.findByText("We couldn't load your next booking")).toBeInTheDocument();
  });

  it('points to search when there is none', async () => {
    server.use(getBookingsListMineMockHandler({ items: [] }));
    renderWithQuery(<NextBooking />);
    expect(await screen.findByText('You have no upcoming bookings.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Find a space' })).toHaveAttribute('href', '/find');
  });
});
