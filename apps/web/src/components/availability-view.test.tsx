import type { OwnerSeat, SpaceCalendars } from '@bseat/api-client';
import {
  getCalendarsListMockHandler,
  getOwnerSeatsListSeatsMockHandler,
  getOwnerSpacesGetMockHandler,
} from '@bseat/api-client/mocks';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { AvailabilityView } from './availability-view';

const shared = { startDate: '2026-01-05', endDate: null, weekdays: ['mon', 'tue', 'wed'] } as const;
const calendars: SpaceCalendars = {
  shared: { ...shared, weekdays: [...shared.weekdays] },
  seats: [
    {
      seatId: 'a1',
      label: 'A-1',
      calendar: { startDate: '2026-02-02', endDate: null, weekdays: ['sat', 'sun'] },
    },
  ],
};
const seat = (id: string, label: string, calendar: 'own' | 'shared'): OwnerSeat => ({
  id,
  label,
  features: [],
  cubicle: null,
  calendar,
  today: { state: 'vacant', note: null, markId: null },
});

function use(data: SpaceCalendars = calendars) {
  server.use(
    getOwnerSpacesGetMockHandler({ id: 's1', timeZone: 'Asia/Kolkata' } as never),
    getCalendarsListMockHandler(data),
    getOwnerSeatsListSeatsMockHandler({
      items: [seat('a1', 'A-1', 'own'), seat('a2', 'A-2', 'shared')],
    }),
  );
}
const firstDay = (name: string) => {
  const [el] = screen.getAllByRole('checkbox', { name });
  if (!el) throw new Error(`No ${name} toggle`);
  return el;
};
const change = (n: number) =>
  HttpResponse.json({ calendar: calendars.shared, bookingsOutsideCalendar: n });

describe('AvailabilityView', () => {
  it('shows loading, then the shared form and own-calendar seats', async () => {
    use();
    renderWithQuery(<AvailabilityView spaceId="s1" />);
    expect(screen.getByText('Loading availability…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Shared calendar' })).toBeVisible();
    const list = screen.getByRole('list', { name: 'Seats with their own calendar' });
    expect(within(list).getByText('A-1')).toBeVisible();
    expect(within(list).getByText(/Sat and Sun/)).toBeVisible();
    expect(screen.getByText('Dates are in Asia/Kolkata.')).toBeVisible();
  });

  it('shows the empty state', async () => {
    use({ ...calendars, seats: [] });
    renderWithQuery(<AvailabilityView spaceId="s1" />);
    expect(await screen.findByText(/No seats have their own calendar/)).toBeVisible();
  });

  it('shows an error with retry', async () => {
    server.use(
      getOwnerSpacesGetMockHandler({ id: 's1', timeZone: 'UTC' } as never),
      http.get('*/api/owner/spaces/s1/calendars', () => new HttpResponse(null, { status: 500 })),
    );
    renderWithQuery(<AvailabilityView spaceId="s1" />);
    expect(await screen.findByText("We couldn't load availability")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('offers a way to set a missing shared calendar', async () => {
    server.use(
      getOwnerSpacesGetMockHandler({ id: 's1', timeZone: 'UTC' } as never),
      http.get('*/api/owner/spaces/s1/calendars', () =>
        HttpResponse.json(
          { type: 'about:blank', title: 'Not Found', status: 404 },
          { status: 404 },
        ),
      ),
    );
    renderWithQuery(<AvailabilityView spaceId="s1" />);
    expect(await screen.findByText('This space has no shared calendar')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Save shared calendar' })).toBeVisible();
  });

  it('saves the shared calendar and shows the outside-calendar notice', async () => {
    use();
    let body: unknown;
    server.use(
      http.put('*/api/owner/spaces/s1/calendars/shared', async ({ request }) => {
        body = await request.json();
        return change(2);
      }),
    );
    renderWithQuery(<AvailabilityView spaceId="s1" />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Shared calendar' });
    await user.click(firstDay('Thursday'));
    await user.click(screen.getByRole('button', { name: 'Save shared calendar' }));
    expect(await screen.findByText('Calendar saved')).toBeVisible();
    expect(screen.getByText('2 bookings fall outside the new calendar')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View bookings' })).toHaveAttribute(
      'href',
      '/owner/spaces/s1/bookings',
    );
    expect(body).toEqual({
      startDate: '2026-01-05',
      endDate: null,
      weekdays: ['mon', 'tue', 'wed', 'thu'],
    });
  });

  it('shows no notice when nothing falls outside', async () => {
    use();
    server.use(http.put('*/api/owner/spaces/s1/calendars/shared', () => change(0)));
    renderWithQuery(<AvailabilityView spaceId="s1" />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Shared calendar' });
    await user.click(firstDay('Friday'));
    await user.click(screen.getByRole('button', { name: 'Save shared calendar' }));
    expect(await screen.findByText('Calendar saved')).toBeVisible();
    expect(screen.queryByText(/fall outside/)).not.toBeInTheDocument();
  });

  it('maps a save failure to an alert', async () => {
    use();
    server.use(
      http.put('*/api/owner/spaces/s1/calendars/shared', () =>
        HttpResponse.json({ type: 'about:blank', title: 'Bad', status: 400 }, { status: 400 }),
      ),
    );
    renderWithQuery(<AvailabilityView spaceId="s1" />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Shared calendar' });
    await user.click(firstDay('Friday'));
    await user.click(screen.getByRole('button', { name: 'Save shared calendar' }));
    expect(await screen.findByText("We couldn't save the calendar")).toBeVisible();
  });

  it('gives a seat its own calendar', async () => {
    use();
    let url = '';
    server.use(
      http.put('*/api/owner/spaces/s1/seats/:seatId/calendar', ({ request }) => {
        url = new URL(request.url).pathname;
        return change(0);
      }),
    );
    renderWithQuery(<AvailabilityView spaceId="s1" />);
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Shared calendar' });
    await user.click(screen.getByRole('button', { name: 'Set up calendar' }));
    expect(await screen.findByText('Choose a seat.')).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Seat'), 'a2');
    await user.click(screen.getByRole('button', { name: 'Set up calendar' }));
    await user.click(await screen.findByRole('button', { name: 'Save seat calendar' }));
    await waitFor(() => {
      expect(url).toBe('/api/owner/spaces/s1/seats/a2/calendar');
    });
  });

  it('switches a seat back to shared after confirmation', async () => {
    use();
    let deleted = false;
    server.use(
      http.delete('*/api/owner/spaces/s1/seats/a1/calendar', () => {
        deleted = true;
        return HttpResponse.json({ calendar: null, bookingsOutsideCalendar: 1 });
      }),
    );
    renderWithQuery(<AvailabilityView spaceId="s1" />);
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Use shared calendar for seat A-1' }),
    );
    expect(await screen.findByText('Use the shared calendar for seat A-1?')).toBeVisible();
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Use shared calendar' }));
    await waitFor(() => {
      expect(deleted).toBe(true);
    });
    expect(await screen.findByText('1 booking falls outside the new calendar')).toBeVisible();
  });

  it('edits a seat calendar inline and can cancel', async () => {
    use();
    renderWithQuery(<AvailabilityView spaceId="s1" />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit calendar for seat A-1' }));
    expect(screen.getByRole('button', { name: 'Save calendar' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Edit calendar for seat A-1' })).toBeVisible();
  });
});
