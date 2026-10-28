import {
  getBookingsCreateMockHandler,
  getBookingsCreateResponseMock,
  getListingsGetMockHandler,
  getListingsGetResponseMock,
  getListingsSeatsMockHandler,
  getListingsSeatsResponseMock,
  getMeGetMockHandler,
  getMeGetResponseMock,
} from '@bseat/api-client/mocks';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startDateRange } from '@/lib/seat-picker';
import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { ListingDetails } from './listing-details';

let search = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));

const date = startDateRange('Asia/Kolkata').min;
const listing = getListingsGetResponseMock({
  id: 's1',
  name: 'Hub One',
  timeZone: 'Asia/Kolkata',
  currency: 'INR',
  isOwnSpace: false,
  hasLayout: false,
  country: 'IN',
  offers: [
    {
      slot: 'day',
      startTime: '07:00',
      endTime: '19:00',
      endsNextDay: false,
      prices: { day: '300.00', week: null, month: null },
    },
  ],
  fullDaySavings: null,
});
const seats = getListingsSeatsResponseMock({
  price: '300.00',
  space: { id: 's1', name: 'Hub One', timeZone: 'Asia/Kolkata' },
  seats: [
    {
      id: 'seat1',
      label: 'A1',
      features: [],
      cubicle: null,
      status: 'free',
      firstStartsAt: '2026-11-02T01:30:00Z',
      lastEndsAt: '2026-11-02T13:30:00Z',
      includedDates: 1,
      closedDates: [],
    },
  ],
});
const booked = getBookingsCreateResponseMock({
  price: { amount: '300.00', currency: 'INR' },
  pass: 'day',
  slot: 'day',
  timeZone: 'Asia/Kolkata',
  slotTimes: { startTime: '07:00', endTime: '19:00', endsNextDay: false },
  firstStartsAt: '2026-11-02T01:30:00Z',
  lastEndsAt: '2026-11-02T13:30:00Z',
  skippedDates: [],
  seat: { id: 'seat1', label: 'A1', cubicleName: null },
  space: { id: 's1', name: 'Hub One', area: 'Baner', city: 'Pune', country: 'IN' },
});

function problem(status: number, type: string) {
  return http.post('*/api/listings/:id/bookings', () =>
    HttpResponse.json({ type: `urn:bseat:problem:${type}`, title: 'T', status }, { status }),
  );
}

async function toReview() {
  await userEvent.click(await screen.findByRole('radio', { name: 'A1, Free' }));
  await userEvent.click(screen.getByRole('button', { name: 'Review booking' }));
}

beforeEach(() => {
  search = `country=IN&pass=day&slot=day&startDate=${date}`;
  window.history.replaceState(null, '', `/listings/s1?${search}`);
  server.use(
    getListingsGetMockHandler(listing),
    getListingsSeatsMockHandler(seats),
    getMeGetMockHandler(getMeGetResponseMock({ email: 'me@example.com' })),
  );
});

describe('listing URL sync', () => {
  it('preselects pass, slot and date from the URL and keeps the search on the back link', async () => {
    renderWithQuery(<ListingDetails spaceId="s1" />);
    expect(
      await screen.findByRole('radio', { name: 'Day pass, Day slot, 07:00 to 19:00, ₹300.00' }),
    ).toBeChecked();
    expect(screen.getByLabelText('Start date')).toHaveValue(date);
    expect(screen.getByRole('link', { name: 'Back to results' })).toHaveAttribute(
      'href',
      `/find?${search}`,
    );
  });

  it('writes a changed date to the URL with replace and keeps the search', async () => {
    renderWithQuery(<ListingDetails spaceId="s1" />);
    const field = await screen.findByLabelText('Start date');
    const before = window.history.length;
    await userEvent.clear(field);
    await waitFor(() => {
      expect(window.location.search).not.toContain('startDate');
    });
    expect(window.location.search).toContain('country=IN');
    expect(window.history.length).toBe(before);
  });
});

describe('booking', () => {
  it('review dialog opens on Change selection and returns focus when closed', async () => {
    renderWithQuery(<ListingDetails spaceId="s1" />);
    await toReview();
    const dialog = await screen.findByRole('alertdialog', { name: 'Confirm your booking' });
    expect(within(dialog).getByText(/You'll pay ₹300.00 directly to the owner/)).toBeVisible();
    expect(within(dialog).getByText('Times are in Asia/Kolkata.')).toBeVisible();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Change selection' })).toHaveFocus();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Change selection' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Review booking' })).toHaveFocus();
    });
  });

  it('success: confirmation card takes focus and shows the offline note', async () => {
    const seen = vi.fn();
    server.use(
      getBookingsCreateMockHandler((info) => {
        seen(info.request.url);
        return booked;
      }),
    );
    renderWithQuery(<ListingDetails spaceId="s1" />);
    await toReview();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
    const heading = await screen.findByRole('heading', { name: 'Booking confirmed' });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
    expect(screen.getByText(/directly to the owner. BSeat doesn't take payments./)).toBeVisible();
    expect(await screen.findByText("We're sending the details to me@example.com.")).toBeVisible();
    expect(screen.getByRole('link', { name: 'View my bookings' })).toHaveAttribute(
      'href',
      '/bookings',
    );
    expect(screen.queryByText('Choose a pass')).not.toBeInTheDocument();
  });

  it('pending: confirm is busy, disabled, and sends once', async () => {
    let calls = 0;
    server.use(
      http.post('*/api/listings/:id/bookings', async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 100));
        return HttpResponse.json(booked, { status: 201 });
      }),
    );
    renderWithQuery(<ListingDetails spaceId="s1" />);
    await toReview();
    const confirm = await screen.findByRole('button', { name: 'Confirm booking' });
    await userEvent.click(confirm);
    const busy = await screen.findByRole('button', { name: 'Booking…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(busy);
    await screen.findByRole('heading', { name: 'Booking confirmed' });
    expect(calls).toBe(1);
  });

  it('seat-unavailable: focused alert, seats refetched, pass and date kept', async () => {
    server.use(problem(409, 'booking:seat-unavailable'));
    renderWithQuery(<ListingDetails spaceId="s1" />);
    await toReview();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Seat no longer available')).toBeVisible();
    expect(alert).toHaveTextContent('A1 was taken');
    await waitFor(() => {
      expect(alert).toHaveFocus();
    });
    expect(screen.getByLabelText('Start date')).toHaveValue(date);
    expect(screen.getByText('Choose a pass, a start date and a seat.')).toBeVisible();
    // changing the seat or date removes the alert
    await userEvent.click(await screen.findByRole('radio', { name: 'A1, Free' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    [409, 'booking:user-overlap', 'You already have a booking then'],
    [422, 'booking-rule:too-far-ahead', "That's too far ahead"],
  ])('%i %s shows its copy', async (status, type, title) => {
    server.use(problem(status, type));
    renderWithQuery(<ListingDetails spaceId="s1" />);
    await toReview();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByText(title)).toBeVisible();
  });

  it('503 shows the retryable fallback and keeps the selection', async () => {
    server.use(problem(503, 'http-503'));
    renderWithQuery(<ListingDetails spaceId="s1" />);
    await toReview();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
    expect(await screen.findByText("We couldn't book that seat")).toBeVisible();
    expect(screen.getByText(/Try again in a moment/)).toBeVisible();
    await userEvent.click(await screen.findByRole('radio', { name: 'A1, Free' }));
    await userEvent.click(screen.getByRole('button', { name: 'Review booking' }));
    expect(await screen.findByRole('alertdialog')).toBeVisible();
  });
});

describe('Review booking with an incomplete choice', () => {
  it('focuses the pass group, the date field, then the seats', async () => {
    search = '';
    window.history.replaceState(null, '', '/listings/s1');
    renderWithQuery(<ListingDetails spaceId="s1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Review booking' }));
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();
    await userEvent.click(screen.getAllByRole('radio')[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Review booking' }));
    expect(screen.getByLabelText('Start date')).toHaveFocus();
    await userEvent.type(screen.getByLabelText('Start date'), date);
    await screen.findByRole('radio', { name: 'A1, Free' });
    await userEvent.click(screen.getByRole('button', { name: 'Review booking' }));
    expect(screen.getByText('Choose a seat.')).toBeVisible();
    expect(screen.getByRole('radio', { name: 'A1, Free' })).toHaveFocus();
  });
});
