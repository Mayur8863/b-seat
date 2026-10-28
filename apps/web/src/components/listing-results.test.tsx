import { getListingsSearchMockHandler } from '@bseat/api-client/mocks';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { EMPTY_FILTERS, type FindFilters } from '@/lib/find-filters';
import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { ListingResults } from './listing-results';

const item = (n: number, over = {}) => ({
  id: `s${n}`,
  name: `Hub ${n}`,
  country: 'IN',
  city: 'Pune',
  area: 'Baner',
  utilities: ['wifi' as const, 'parking' as const],
  customUtilities: ['Rooftop'],
  currency: 'INR',
  lowestPrices: { day: '300.00', week: null, month: '5000.00' },
  hasLayout: false,
  ...over,
});

const base: FindFilters = { ...EMPTY_FILTERS, country: 'IN' };
const render = (filters: FindFilters = base, handlers = {}) =>
  renderWithQuery(
    <ListingResults
      filters={filters}
      countryName="India"
      onSearchWholeCountry={vi.fn()}
      onClearFilters={vi.fn()}
      {...handlers}
    />,
  );

describe('ListingResults', () => {
  it('loading: busy skeleton list and a polite status', () => {
    server.use(http.get('*/api/listings', () => new Promise(() => undefined)));
    render();
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('success: card shows area, utilities, only offered prices, and links to the space', async () => {
    server.use(
      getListingsSearchMockHandler({ items: [item(1, { hasLayout: true })], nextCursor: null }),
    );
    render({ ...base, city: 'Pune' });
    const link = await screen.findByRole('link', { name: 'Hub 1' });
    expect(link).toHaveAttribute('href', '/spaces/s1?country=IN&city=Pune');
    expect(screen.getByText('Baner, Pune')).toBeInTheDocument();
    const badges = within(screen.getByRole('list', { name: 'Utilities' }));
    expect(badges.getAllByRole('listitem').map((l) => l.textContent)).toEqual([
      'Wi-Fi',
      'Parking',
      'Rooftop',
    ]);
    expect(screen.getByText(/^From/)).toHaveTextContent(
      'From ₹300.00 per day pass · ₹5,000.00 per monthly pass',
    );
    expect(screen.getByText('Floor plan')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 space in Pune, India');
  });

  it('error: alert with a retry that refetches', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get('*/api/listings', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ type: 'x', title: 'x', status: 500 }, { status: 500 })
          : HttpResponse.json({ items: [item(1)], nextCursor: null });
      }),
    );
    render();
    expect(await screen.findByText("We couldn't load spaces")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Hub 1' })).toBeInTheDocument();
  });

  it('empty with a city: offers the whole country', async () => {
    const user = userEvent.setup();
    const whole = vi.fn();
    server.use(getListingsSearchMockHandler({ items: [], nextCursor: null }));
    render({ ...base, city: 'Pune' }, { onSearchWholeCountry: whole });
    expect(await screen.findByText('No spaces match your search.')).toBeInTheDocument();
    expect(
      screen.getByText('Try a different area, or look across the whole country.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Search all of India' }));
    expect(whole).toHaveBeenCalledOnce();
  });

  it('empty with only other filters: offers Clear filters', async () => {
    const user = userEvent.setup();
    const clear = vi.fn();
    server.use(getListingsSearchMockHandler({ items: [], nextCursor: null }));
    render({ ...base, pass: 'week' }, { onClearFilters: clear });
    expect(
      await screen.findByText('Try fewer filters or a different start date.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(clear).toHaveBeenCalledOnce();
  });

  it('empty with the country only: nothing to widen', async () => {
    server.use(getListingsSearchMockHandler({ items: [], nextCursor: null }));
    render();
    expect(await screen.findByText('No spaces are listed in India yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('paging: appends the next page, focuses its first card, drops the button at the end', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/listings', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        return HttpResponse.json(
          cursor ? { items: [item(2)], nextCursor: null } : { items: [item(1)], nextCursor: 'c1' },
        );
      }),
    );
    render();
    await screen.findByRole('link', { name: 'Hub 1' });
    expect(screen.getByRole('status')).toHaveTextContent('Showing 1 spaces');
    await user.click(screen.getByRole('button', { name: 'Show more spaces' }));
    const second = await screen.findByRole('link', { name: 'Hub 2' });
    await vi.waitFor(() => {
      expect(second).toHaveFocus();
    });
    expect(screen.queryByRole('button', { name: 'Show more spaces' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 spaces in India');
  });

  it('paging failure keeps the loaded cards and offers a retry', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/listings', ({ request }) =>
        new URL(request.url).searchParams.get('cursor')
          ? HttpResponse.json({ type: 'x', title: 'x', status: 500 }, { status: 500 })
          : HttpResponse.json({ items: [item(1)], nextCursor: 'c1' }),
      ),
    );
    render();
    await user.click(await screen.findByRole('button', { name: 'Show more spaces' }));
    expect(await screen.findByText("We couldn't load more spaces")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hub 1' })).toBeInTheDocument();
  });
});
