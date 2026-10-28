import type { OwnerSpaceSummary } from '@bseat/api-client';
import { getOwnerSpacesListMockHandler } from '@bseat/api-client/mocks';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { OwnerSpaces } from './owner-spaces';

const space = (over: Partial<OwnerSpaceSummary>): OwnerSpaceSummary => ({
  id: 's1',
  status: 'draft',
  name: 'Hub One',
  city: 'Pune',
  area: 'Baner',
  country: 'IN',
  seatCount: 0,
  hasOfferedPass: false,
  upcomingBookingCount: 0,
  ...over,
});

async function cardOf(name: string): Promise<HTMLElement> {
  const item = (await screen.findByRole('heading', { name })).closest('li');
  if (!item) throw new Error('no card');
  return item;
}

describe('OwnerSpaces', () => {
  it('loading: busy skeleton with a polite status', () => {
    server.use(getOwnerSpacesListMockHandler({ items: [] }));
    renderWithQuery(<OwnerSpaces />);
    expect(screen.getByText('Loading your spaces…')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'List a space' })).toHaveAttribute(
      'href',
      '/owner/spaces/new',
    );
  });

  it('empty: invites the owner to list a first space', async () => {
    server.use(getOwnerSpacesListMockHandler({ items: [] }));
    renderWithQuery(<OwnerSpaces />);
    expect(await screen.findByText("You haven't listed a space yet.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'List your first space' })).toHaveAttribute(
      'href',
      '/owner/spaces/new',
    );
  });

  it('success: each space shows name, status, facts, what is missing and a manage link', async () => {
    server.use(
      getOwnerSpacesListMockHandler({
        items: [
          space({}),
          space({
            id: 's2',
            name: 'Loft',
            status: 'published',
            seatCount: 12,
            hasOfferedPass: true,
            upcomingBookingCount: 1,
          }),
          space({ id: 's3', name: 'Barn', status: 'unpublished', seatCount: 3 }),
        ],
      }),
    );
    renderWithQuery(<OwnerSpaces />);
    const hub = await cardOf('Hub One');
    expect(within(hub).getByText('Draft')).toBeInTheDocument();
    expect(within(hub).getByText('Baner, Pune')).toBeInTheDocument();
    expect(within(hub).getByText('No seats yet · No upcoming bookings')).toBeInTheDocument();
    expect(within(hub).getByText('To publish: add seats, price a pass')).toBeInTheDocument();
    expect(within(hub).getByRole('link', { name: 'Details for Hub One' })).toHaveAttribute(
      'href',
      '/owner/spaces/s1',
    );

    const loft = await cardOf('Loft');
    expect(within(loft).getByText('Published')).toBeInTheDocument();
    expect(within(loft).getByText('12 seats · 1 upcoming booking')).toBeInTheDocument();
    expect(within(loft).queryByText(/To publish/)).not.toBeInTheDocument();

    const barn = await cardOf('Barn');
    expect(within(barn).getByText('Unpublished')).toBeInTheDocument();
    expect(within(barn).getByText('To publish: price a pass')).toBeInTheDocument();
  });

  it('error: alert with a retry that refetches', async () => {
    let fail = true;
    server.use(
      http.get('*/api/owner/spaces', () =>
        fail
          ? HttpResponse.json({ type: 'urn:bseat:problem:http-500', status: 500 }, { status: 500 })
          : HttpResponse.json({ items: [] }),
      ),
    );
    renderWithQuery(<OwnerSpaces />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText("We couldn't load your spaces")).toBeInTheDocument();
    expect(within(alert).getByText('Try again in a moment.')).toBeInTheDocument();
    fail = false;
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText("You haven't listed a space yet.")).toBeInTheDocument();
  });

  it('error: a session that ended links to sign-in', async () => {
    server.use(
      http.get('*/api/owner/spaces', () =>
        HttpResponse.json({ type: 'urn:bseat:problem:http-401', status: 401 }, { status: 401 }),
      ),
    );
    renderWithQuery(<OwnerSpaces />);
    expect(await screen.findByText('Your session has ended')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeInTheDocument();
  });
});
