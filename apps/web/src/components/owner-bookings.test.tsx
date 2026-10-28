import type { OwnerBooking } from '@bseat/api-client';
import { getOwnerOperationsListBookingsMockHandler } from '@bseat/api-client/mocks';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { OwnerBookings } from './owner-bookings';

const push = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(search),
}));

const booking = (id: string, name: string): OwnerBooking => ({
  id,
  status: 'active',
  renter: { name, email: `${name.toLowerCase()}@example.com` },
  seat: { id: `seat-${id}`, label: `A-${id}` },
  pass: 'week',
  slot: 'day',
  startDate: '2026-11-03',
  endDate: '2026-11-09',
  timeZone: 'Asia/Kolkata',
  firstStartsAt: '2026-11-03T03:30:00Z',
  lastEndsAt: '2026-11-09T12:30:00Z',
  price: { amount: '3000.00', currency: 'INR' },
  createdAt: '2026-10-20T10:00:00Z',
});

const problem = (status: number) =>
  HttpResponse.json({ type: 'about:blank', title: 'x', status }, { status });
const url = '*/api/owner/spaces/s1/bookings';

beforeEach(() => {
  search = '';
  push.mockClear();
});

describe('OwnerBookings', () => {
  it('shows loading, then each booking with a mailto link', async () => {
    server.use(
      getOwnerOperationsListBookingsMockHandler({
        items: [booking('1', 'Asha')],
        nextCursor: null,
      }),
    );
    renderWithQuery(<OwnerBookings spaceId="s1" />);
    expect(screen.getByText('Loading bookings…')).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Bookings' });
    expect(within(list).getByRole('heading', { name: 'Asha' })).toBeVisible();
    expect(within(list).getByRole('link', { name: 'asha@example.com' })).toHaveAttribute(
      'href',
      'mailto:asha@example.com',
    );
    expect(within(list).getByText('A-1')).toBeVisible();
    expect(within(list).getByText('Weekly pass · Day slot')).toBeVisible();
    expect(within(list).getByText('Tue 3 Nov 2026 to Mon 9 Nov 2026')).toBeVisible();
    expect(screen.getByText('Dates and times are in Asia/Kolkata.')).toBeVisible();
    expect(screen.getByText('1 booking')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Show more bookings' })).toBeNull();
  });

  it('shows the empty state without and with a filter', async () => {
    server.use(getOwnerOperationsListBookingsMockHandler({ items: [], nextCursor: null }));
    const { unmount } = renderWithQuery(<OwnerBookings spaceId="s1" />);
    expect(await screen.findByText('No upcoming bookings yet.')).toBeVisible();
    unmount();
    search = 'from=2026-11-01';
    renderWithQuery(<OwnerBookings spaceId="s1" />);
    expect(await screen.findByText('No bookings in that date range.')).toBeVisible();
    expect(screen.getByText('Showing bookings from Sun 1 Nov 2026.')).toBeVisible();
  });

  it('shows an error with retry', async () => {
    server.use(http.get(url, () => problem(500)));
    renderWithQuery(<OwnerBookings spaceId="s1" />);
    expect(await screen.findByText("We couldn't load bookings")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('validates the range without a request, then pushes the filter to the URL', async () => {
    server.use(getOwnerOperationsListBookingsMockHandler({ items: [], nextCursor: null }));
    renderWithQuery(<OwnerBookings spaceId="s1" />);
    await screen.findByText('No upcoming bookings yet.');
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('From (optional)'), '2026-11-05');
    await user.type(screen.getByLabelText('To (optional)'), '2026-11-02');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    const to = screen.getByLabelText('To (optional)');
    expect(to).toHaveAccessibleDescription(/To can't be before From\./);
    expect(push).not.toHaveBeenCalled();
    await user.clear(to);
    await user.type(to, '2026-11-09');
    await user.click(screen.getByRole('button', { name: 'Filter' }));
    expect(push).toHaveBeenCalledWith('/owner/spaces/s1/bookings?from=2026-11-05&to=2026-11-09');
  });

  it('sends the applied range to the API and clears it', async () => {
    search = 'from=2026-11-05&to=2026-11-09';
    let seen = '';
    server.use(
      http.get(url, ({ request }) => {
        seen = new URL(request.url).search;
        return HttpResponse.json({ items: [booking('1', 'Asha')], nextCursor: null });
      }),
    );
    renderWithQuery(<OwnerBookings spaceId="s1" />);
    await screen.findByRole('list', { name: 'Bookings' });
    expect(seen).toContain('from=2026-11-05');
    expect(seen).toContain('to=2026-11-09');
    await userEvent.click(screen.getByRole('button', { name: 'Clear dates' }));
    expect(push).toHaveBeenCalledWith('/owner/spaces/s1/bookings');
  });

  it('appends the next page and focuses its first new booking', async () => {
    const cursors: (string | null)[] = [];
    server.use(
      http.get(url, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        cursors.push(cursor);
        return HttpResponse.json(
          cursor
            ? { items: [booking('2', 'Bela')], nextCursor: null }
            : { items: [booking('1', 'Asha')], nextCursor: 'c1' },
        );
      }),
    );
    renderWithQuery(<OwnerBookings spaceId="s1" />);
    expect(await screen.findByText('Showing 1 booking')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Show more bookings' }));
    const bela = await screen.findByRole('heading', { name: 'Bela' });
    await waitFor(() => {
      expect(bela).toHaveFocus();
    });
    expect(cursors).toEqual([null, 'c1']);
    expect(screen.getByText('2 bookings')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Asha' })).toBeVisible();
  });

  it('keeps loaded items when more fail to load', async () => {
    server.use(
      http.get(url, ({ request }) =>
        new URL(request.url).searchParams.get('cursor')
          ? problem(500)
          : HttpResponse.json({ items: [booking('1', 'Asha')], nextCursor: 'c1' }),
      ),
    );
    renderWithQuery(<OwnerBookings spaceId="s1" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Show more bookings' }));
    expect(await screen.findByText("We couldn't load more bookings")).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Asha' })).toBeVisible();
  });
});
