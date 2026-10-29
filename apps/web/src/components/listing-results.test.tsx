import { getListingsSearchMockHandler } from '@bseat/api-client/mocks';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  cover: null,
  ...over,
});

const fullPage = Array.from({ length: 20 }, (_, n) => item(n + 1));
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
      getListingsSearchMockHandler({
        items: [item(1, { hasLayout: true })],
        nextCursor: null,
        photoUrlsExpireAt: null,
      }),
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

  it('cover: card image with alt, signed URL; placeholder when none; one tab stop per card', async () => {
    server.use(
      getListingsSearchMockHandler({
        items: [
          item(1, {
            cover: {
              altText: 'Bright room',
              card: { url: 'https://s3.test/c1.webp?sig=1', width: 640, height: 480 },
            },
          }),
          item(2),
        ],
        nextCursor: null,
        photoUrlsExpireAt: null,
      }),
    );
    render();
    const img = await screen.findByRole('img', { name: 'Bright room' });
    expect(img).toHaveAttribute('src', 'https://s3.test/c1.webp?sig=1');
    expect(screen.getByText('No photos yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Hub 1' }).className).toContain('after:absolute');
  });

  it('cover error: refetches the search once', async () => {
    let calls = 0;
    server.use(
      http.get('*/api/listings', () => {
        calls += 1;
        return HttpResponse.json({
          items: [
            item(1, {
              cover: {
                altText: 'Bright room',
                card: { url: `https://s3.test/c1.webp?sig=${calls}`, width: 640, height: 480 },
              },
            }),
          ],
          nextCursor: null,
          photoUrlsExpireAt: '2099-01-01T00:00:00Z',
        });
      }),
    );
    render();
    const img = await screen.findByRole('img', { name: 'Bright room' });
    fireEvent.error(img);
    await waitFor(() => {
      expect(calls).toBe(2);
    });
    await waitFor(() =>
      expect(screen.getByRole('img', { name: 'Bright room' })).toHaveAttribute(
        'src',
        'https://s3.test/c1.webp?sig=2',
      ),
    );
  });

  it('error: alert with a retry that refetches', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get('*/api/listings', () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ type: 'x', title: 'x', status: 500 }, { status: 500 })
          : HttpResponse.json({ items: [item(1)], nextCursor: null, photoUrlsExpireAt: null });
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
    server.use(
      getListingsSearchMockHandler({ items: [], nextCursor: null, photoUrlsExpireAt: null }),
    );
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
    server.use(
      getListingsSearchMockHandler({ items: [], nextCursor: null, photoUrlsExpireAt: null }),
    );
    render({ ...base, pass: 'week' }, { onClearFilters: clear });
    expect(
      await screen.findByText('Try fewer filters or a different start date.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(clear).toHaveBeenCalledOnce();
  });

  it('empty with the country only: nothing to widen', async () => {
    server.use(
      getListingsSearchMockHandler({ items: [], nextCursor: null, photoUrlsExpireAt: null }),
    );
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
          cursor ? { items: [item(21)], nextCursor: null } : { items: fullPage, nextCursor: 'c1' },
        );
      }),
    );
    render();
    await screen.findByRole('link', { name: 'Hub 1' });
    expect(screen.getByRole('status')).toHaveTextContent('Showing 20 spaces');
    await user.click(screen.getByRole('button', { name: 'Show more spaces' }));
    const second = await screen.findByRole('link', { name: 'Hub 21' });
    await vi.waitFor(
      () => {
        expect(second).toHaveFocus();
      },
      { timeout: 5000 },
    );
    expect(screen.queryByRole('button', { name: 'Show more spaces' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('21 spaces in India');
  });

  it('paging failure keeps the loaded cards and offers a retry', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/listings', ({ request }) =>
        new URL(request.url).searchParams.get('cursor')
          ? HttpResponse.json({ type: 'x', title: 'x', status: 500 }, { status: 500 })
          : HttpResponse.json({ items: fullPage, nextCursor: 'c1' }),
      ),
    );
    render();
    await user.click(await screen.findByRole('button', { name: 'Show more spaces' }));
    expect(await screen.findByText("We couldn't load more spaces")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Hub 1' })).toBeInTheDocument();
  });
  it('keeps paging through empty pages while a cursor is set, never saying no match', async () => {
    let calls = 0;
    server.use(
      http.get('*/api/listings', ({ request }) => {
        calls += 1;
        const cursor = new URL(request.url).searchParams.get('cursor');
        if (!cursor) return HttpResponse.json({ items: [], nextCursor: 'c1' });
        if (cursor === 'c1') return HttpResponse.json({ items: [], nextCursor: 'c2' });
        return HttpResponse.json({ items: [item(7)], nextCursor: null, photoUrlsExpireAt: null });
      }),
    );
    render({ ...base, city: 'Pune' });
    expect(await screen.findByRole('link', { name: 'Hub 7' })).toBeInTheDocument();
    expect(calls).toBe(3);
    expect(screen.queryByText('No spaces match your search.')).not.toBeInTheDocument();
  });

  it('after a few empty rounds it offers Show more instead of claiming no match', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('*/api/listings', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        return HttpResponse.json({ items: [], nextCursor: `${cursor ?? 'c'}x` });
      }),
    );
    render({ ...base, city: 'Pune' });
    expect(
      await screen.findByRole('button', { name: 'Show more spaces' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('No spaces match your search.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show more spaces' }));
  });

  it('running the same search again replaces the pages instead of appending', async () => {
    const user = userEvent.setup();
    let round = 0;
    server.use(
      http.get('*/api/listings', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        if (cursor)
          return HttpResponse.json({
            items: [item(21)],
            nextCursor: null,
            photoUrlsExpireAt: null,
          });
        round += 1;
        return HttpResponse.json({ items: fullPage, nextCursor: round === 1 ? 'c1' : null });
      }),
    );
    const view = render();
    await user.click(await screen.findByRole('button', { name: 'Show more spaces' }));
    await screen.findByRole('link', { name: 'Hub 21' });
    await view.client.invalidateQueries();
    await vi.waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Hub 21' })).not.toBeInTheDocument();
    });
    expect(screen.getAllByRole('link', { name: 'Hub 1' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Show more spaces' })).not.toBeInTheDocument();
  });
});
