import {
  getListingLayoutGetMockHandler,
  getListingsSeatsMockHandler,
  getListingsSeatsResponseMock,
} from '@bseat/api-client/mocks';
import type { ListingSeatAvailability } from '@bseat/api-client';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { ListingSeatList } from './listing-seat-list';

type SeatItem = ListingSeatAvailability['seats'][number];
const seat = (over: Partial<SeatItem>): SeatItem => ({
  id: 'x',
  label: 'A1',
  features: [],
  cubicle: null,
  status: 'free',
  firstStartsAt: '2026-11-02T01:30:00Z',
  lastEndsAt: '2026-11-08T13:30:00Z',
  includedDates: 6,
  closedDates: [],
  ...over,
});
const data = (seats: SeatItem[]) => getListingsSeatsResponseMock({ seats });

function setup(onSelect = vi.fn(), selectedSeatId: string | null = null) {
  renderWithQuery(
    <ListingSeatList
      spaceId="s1"
      choice={{ pass: 'week', slot: 'day' }}
      startDate="2026-11-02"
      timeZone="Asia/Kolkata"
      selectedSeatId={selectedSeatId}
      onSelect={onSelect}
    />,
  );
  return onSelect;
}

describe('ListingSeatList', () => {
  it('loading: busy status', () => {
    server.use(getListingsSeatsMockHandler(data([seat({})])));
    setup();
    expect(screen.getByText('Loading seats…')).toBeInTheDocument();
  });

  it('success: free, taken and closed by text, end time, closed days, count', async () => {
    server.use(
      getListingsSeatsMockHandler(
        data([
          seat({
            id: 'a',
            label: 'A1',
            cubicle: { id: 'c', name: 'Quiet' },
            closedDates: ['2026-11-07'],
          }),
          seat({ id: 'b', label: 'A2', status: 'taken', lastEndsAt: null, firstStartsAt: null }),
          seat({ id: 'c', label: 'A3', status: 'closed', lastEndsAt: null, firstStartsAt: null }),
        ]),
      ),
    );
    setup();
    expect(await screen.findByText('1 of 3 seats are free for this pass.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'A1, Quiet, Free' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'A2, Taken' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /^A3, Closed on .*2 Nov 2026$/ })).toBeDisabled();
    expect(screen.getByText('Ends Sun 8 Nov 2026, 19:00 (Asia/Kolkata)')).toBeInTheDocument();
    expect(screen.getByText('Skips 1 closed day')).toBeInTheDocument();
  });

  it('selecting a free seat reports it and announces it', async () => {
    server.use(getListingsSeatsMockHandler(data([seat({ id: 'a', label: 'A1' })])));
    const onSelect = setup();
    await userEvent.click(await screen.findByRole('radio', { name: 'A1, Free' }));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ seat: expect.objectContaining({ id: 'a' }) }),
    );
    expect(screen.getByText('Seat A1 selected.')).toBeInTheDocument();
  });

  it('hide seats that are not free', async () => {
    server.use(
      getListingsSeatsMockHandler(
        data([seat({ id: 'a', label: 'A1' }), seat({ id: 'b', label: 'A2', status: 'taken' })]),
      ),
    );
    setup();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: "Hide seats that aren't free" }),
    );
    expect(screen.queryByRole('radio', { name: /A2/ })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /A1/ })).toBeInTheDocument();
  });

  it('empty: no seat free for the whole period', async () => {
    server.use(getListingsSeatsMockHandler(data([seat({ status: 'taken' })])));
    setup();
    expect(await screen.findByText('No seat is free for the whole period.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Taken/ })).toBeInTheDocument();
  });

  it('empty: space without seats', async () => {
    server.use(getListingsSeatsMockHandler(data([])));
    setup();
    expect(await screen.findByText('This space has no seats right now.')).toBeInTheDocument();
  });

  it('clears a selected seat that is no longer free', async () => {
    server.use(
      getListingsSeatsMockHandler(data([seat({ id: 'a', label: 'A1', status: 'taken' })])),
    );
    const onSelect = setup(vi.fn(), 'a');
    expect(
      await screen.findByText('Seat A1 is no longer free. Choose another seat.'),
    ).toBeInTheDocument();
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('error: retry copy', async () => {
    server.use(
      http.get('*/api/listings/:id/seats', () =>
        HttpResponse.json({ status: 500, title: 'x' }, { status: 500 }),
      ),
    );
    setup();
    expect(await screen.findByText("We couldn't load seats")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('422 pass-not-offered', async () => {
    server.use(
      http.get('*/api/listings/:id/seats', () =>
        HttpResponse.json(
          { status: 422, title: 'x', type: 'urn:bseat:problem:booking-rule:pass-not-offered' },
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    setup();
    expect(await screen.findByText("That pass isn't offered")).toBeInTheDocument();
    expect(screen.getByText('Choose another pass or slot.')).toBeInTheDocument();
  });
});

describe('ListingSeatList plan view', () => {
  const layout = {
    columns: 10,
    rows: 6,
    elements: [
      { kind: 'cubicle' as const, seatId: null, label: 'Pod 1', x: 0, y: 0, w: 6, h: 4 },
      { kind: 'area' as const, seatId: null, label: 'Kitchen', x: 7, y: 0, w: 3, h: 3 },
      { kind: 'seat' as const, seatId: 'a', label: 'A1', x: 0, y: 0, w: 2, h: 2 },
      { kind: 'seat' as const, seatId: 'b', label: 'A2', x: 2, y: 0, w: 2, h: 2 },
      { kind: 'seat' as const, seatId: 'c', label: 'A3', x: 4, y: 0, w: 1, h: 1 },
    ],
  };
  const seats = [
    seat({ id: 'a', label: 'A1', cubicle: { id: 'p', name: 'Pod 1' } }),
    seat({ id: 'b', label: 'A2', status: 'taken' }),
    seat({ id: 'c', label: 'A3' }),
    seat({ id: 'd', label: 'Loose' }),
  ];

  function plan(onSelect = vi.fn(), hasLayout = true) {
    renderWithQuery(
      <ListingSeatList
        spaceId="s1"
        hasLayout={hasLayout}
        choice={{ pass: 'week', slot: 'day' }}
        startDate="2026-11-02"
        timeZone="Asia/Kolkata"
        selectedSeatId={null}
        onSelect={onSelect}
      />,
    );
    return onSelect;
  }

  it('defaults to List when narrow; switch shows the plan with legend and off-plan seats', async () => {
    server.use(getListingsSeatsMockHandler(data(seats)), getListingLayoutGetMockHandler(layout));
    plan();
    const planButton = await screen.findByRole('button', { name: 'Plan' });
    expect(planButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('region', { name: /Floor plan/ })).not.toBeInTheDocument();
    await userEvent.click(planButton);
    expect(screen.getByRole('region', { name: 'Floor plan, 10 by 6 squares' })).toBeInTheDocument();
    expect(screen.getByText('Areas on this plan: Kitchen.')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Legend' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'A1, Pod 1, Free' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'A2, Taken' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('heading', { name: 'Seats not on the plan' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Loose, Free' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'List' }));
    expect(screen.getAllByRole('radio')).toHaveLength(4);
  });

  it('selects a free seat on the plan and moves with arrow keys, skipping taken seats', async () => {
    server.use(getListingsSeatsMockHandler(data(seats)), getListingLayoutGetMockHandler(layout));
    const onSelect = plan();
    await userEvent.click(await screen.findByRole('button', { name: 'Plan' }));
    await userEvent.click(screen.getByRole('radio', { name: 'A1, Pod 1, Free' }));
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ seat: expect.objectContaining({ id: 'a' }) }),
    );
    await userEvent.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenLastCalledWith(
      expect.objectContaining({ seat: expect.objectContaining({ id: 'c' }) }),
    );
  });

  it('no layout (404): list only, no switch', async () => {
    server.use(
      getListingsSeatsMockHandler(data(seats)),
      http.get('*/api/listings/:id/layout', () =>
        HttpResponse.json({ status: 404, title: 'x' }, { status: 404 }),
      ),
    );
    plan();
    await screen.findByRole('radio', { name: 'A1, Pod 1, Free' });
    expect(screen.queryByRole('button', { name: 'Plan' })).not.toBeInTheDocument();
  });

  it('hasLayout false: no layout request, no switch', async () => {
    server.use(getListingsSeatsMockHandler(data(seats)));
    plan(vi.fn(), false);
    await screen.findByRole('radio', { name: 'A1, Pod 1, Free' });
    expect(screen.queryByRole('group', { name: 'Seat view' })).not.toBeInTheDocument();
  });

  it('layout error: message with retry, list stays', async () => {
    server.use(
      getListingsSeatsMockHandler(data(seats)),
      http.get('*/api/listings/:id/layout', () =>
        HttpResponse.json({ status: 500, title: 'x' }, { status: 500 }),
      ),
    );
    plan();
    expect(await screen.findByText(/The floor plan isn't available right now/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Plan' })).not.toBeInTheDocument();
  });

  it('layout loading: sr text', async () => {
    server.use(
      getListingsSeatsMockHandler(data(seats)),
      http.get('*/api/listings/:id/layout', () => new Promise(() => undefined)),
    );
    plan();
    expect(await screen.findByText('Loading the floor plan…')).toBeInTheDocument();
  });
});
