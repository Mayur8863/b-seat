import { getListingsGetMockHandler, getListingsGetResponseMock } from '@bseat/api-client/mocks';
import type { Listing } from '@bseat/api-client';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { ListingDetails } from './listing-details';

let search = '';
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));

const listing = (over: Partial<Listing> = {}): Listing =>
  getListingsGetResponseMock({
    id: 's1',
    name: 'Hub One',
    description: 'Quiet floor',
    area: 'Baner',
    city: 'Pune',
    country: 'IN',
    streetAddress: '1 Main Road',
    timeZone: 'Asia/Kolkata',
    currency: 'INR',
    utilities: ['wifi'],
    customUtilities: ['Rooftop'],
    openingHours: { mode: 'always_open', shiftChangeAt: '19:00' },
    isOwnSpace: false,
    offers: [
      {
        slot: 'day',
        startTime: '07:00',
        endTime: '19:00',
        endsNextDay: false,
        prices: { day: '300.00', week: null, month: null },
      },
      {
        slot: 'night',
        startTime: '19:00',
        endTime: '07:00',
        endsNextDay: true,
        prices: { day: '300.00', week: null, month: null },
      },
      {
        slot: 'full_day',
        startTime: '07:00',
        endTime: '07:00',
        endsNextDay: true,
        prices: { day: '500.00', week: '3000.00', month: null },
      },
    ],
    fullDaySavings: {
      day: { amount: '100.00', percent: 17 },
      week: null,
      month: null,
    },
    ...over,
  });

describe('ListingDetails', () => {
  it('back link returns to the carried search, or says Find a space without one', async () => {
    server.use(getListingsGetMockHandler(listing()));
    search = 'country=IN&city=Pune&utilities=wifi';
    const first = renderWithQuery(<ListingDetails spaceId="s1" />);
    const back = await screen.findByRole('link', { name: 'Back to results' });
    expect(back).toHaveAttribute('href', '/find?country=IN&city=Pune&utilities=wifi');
    first.unmount();

    search = '';
    renderWithQuery(<ListingDetails spaceId="s1" />);
    expect(await screen.findByRole('link', { name: 'Find a space' })).toHaveAttribute(
      'href',
      '/find',
    );
  });

  it('loading: busy status', () => {
    server.use(getListingsGetMockHandler(listing()));
    renderWithQuery(<ListingDetails spaceId="s1" />);
    expect(screen.getByText('Loading this space…')).toBeInTheDocument();
  });

  it('success: details, slots with times and zone, priced passes only, saving', async () => {
    server.use(getListingsGetMockHandler(listing()));
    renderWithQuery(<ListingDetails spaceId="s1" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Hub One' })).toBeInTheDocument();
    expect(screen.getByText('Baner, Pune, India')).toBeInTheDocument();
    expect(screen.getByText('Open 24 hours')).toBeInTheDocument();
    expect(screen.getByText('Wi-Fi')).toBeInTheDocument();
    expect(screen.getByText('Times are in Asia/Kolkata.')).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'Night slot, 19:00 to 07:00 next day' }),
    ).toBeVisible();
    const full = screen.getByRole('group', { name: '24-hour slot, 07:00 to 07:00 next day' });
    expect(within(full).getAllByRole('radio')).toHaveLength(2);
    expect(
      within(full).getByRole('radio', {
        name: 'Day pass, 24-hour slot, 07:00 to 07:00 next day, ₹500.00',
      }),
    ).toBeInTheDocument();
    expect(
      within(full).getByText('Save ₹100.00 (17%) compared with day and night passes'),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^Save /)).toHaveLength(1);
  });

  it('selects one pass at a time and preselects nothing', async () => {
    server.use(getListingsGetMockHandler(listing()));
    renderWithQuery(<ListingDetails spaceId="s1" />);
    const radios = await screen.findAllByRole('radio');
    expect(radios.every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    const [first, second] = radios;
    if (!first || !second) throw new Error('expected radios');
    await userEvent.click(first);
    await userEvent.click(second);
    expect(radios.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  });

  it('empty: no offers', async () => {
    server.use(getListingsGetMockHandler(listing({ offers: [], fullDaySavings: null })));
    renderWithQuery(<ListingDetails spaceId="s1" />);
    expect(
      await screen.findByText("This space isn't offering passes right now."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('own space: details, no pass options, link to seats', async () => {
    server.use(getListingsGetMockHandler(listing({ isOwnSpace: true })));
    renderWithQuery(<ListingDetails spaceId="s1" />);
    expect(await screen.findByText('This is your space')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage seats' })).toHaveAttribute(
      'href',
      '/owner/spaces/s1/seats',
    );
    expect(screen.queryByText('Choose a pass')).not.toBeInTheDocument();
  });

  it('404: not-found state', async () => {
    server.use(
      http.get('*/api/listings/:id', () =>
        HttpResponse.json({ status: 404, title: 'Not Found' }, { status: 404 }),
      ),
    );
    renderWithQuery(<ListingDetails spaceId="s1" />);
    expect(
      await screen.findByRole('heading', { name: "We couldn't find that space" }),
    ).toBeInTheDocument();
  });

  it('500: error with retry', async () => {
    server.use(
      http.get('*/api/listings/:id', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
    );
    renderWithQuery(<ListingDetails spaceId="s1" />);
    expect(await screen.findByText("We couldn't load this space")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

describe('ListingDetails seat selection', () => {
  it('asks for pass and date, then fills Your selection', async () => {
    server.use(getListingsGetMockHandler(listing()));
    renderWithQuery(<ListingDetails spaceId="s1" />);
    expect(
      await screen.findByText('Choose a pass and a start date to see which seats are free.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('radio')[0]!);
    expect(screen.getByLabelText('Start date')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Review booking' }));
    expect(screen.getByText('Choose a start date.')).toBeInTheDocument();
  });
});
