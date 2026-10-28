import type { OwnerSpace, SpacePricing } from '@bseat/api-client';
import {
  getOwnerSpacesGetMockHandler,
  getOwnerSpacesGetPricingMockHandler,
} from '@bseat/api-client/mocks';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { SlotKind } from '@/lib/pricing-values';
import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { PricingForm } from './pricing-form';

vi.mock('next/navigation', () => ({
  usePathname: () => '/owner/spaces/s1/pricing',
}));

const space = {
  id: 's1',
  timeZone: 'Asia/Kolkata',
  currency: 'INR',
  openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
} as unknown as OwnerSpace;

interface Prices {
  day: string | null;
  week: string | null;
  month: string | null;
}
const none: Prices = { day: null, week: null, month: null };
const slot = (
  s: SlotKind,
  start: string,
  end: string,
  next: boolean,
  enabled = true,
  prices: Prices = none,
): SpacePricing['slots'][number] => ({
  slot: s,
  enabled,
  startTime: start,
  endTime: end,
  endsNextDay: next,
  prices,
});
const always = (prices: Prices = none): SpacePricing => ({
  currency: 'INR',
  openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
  slots: [
    slot('day', '07:00', '19:00', false, true, prices),
    slot('night', '19:00', '07:00', true, false),
    slot('full_day', '07:00', '07:00', true, false),
  ],
});
const fixed: SpacePricing = {
  currency: 'INR',
  openingHours: { mode: 'fixed_hours', opensAt: '09:00', closesAt: '18:00' },
  slots: [
    slot('working_hours', '09:00', '18:00', false, true, {
      day: '500.00',
      week: null,
      month: null,
    }),
  ],
};

const setup = (pricing: SpacePricing, sp: OwnerSpace = space) => {
  server.use(getOwnerSpacesGetMockHandler(sp), getOwnerSpacesGetPricingMockHandler(pricing));
  return renderWithQuery(<PricingForm spaceId="s1" />);
};

describe('PricingForm', () => {
  it('loading state', () => {
    setup(always());
    expect(screen.getByRole('status')).toHaveTextContent('Loading prices…');
  });

  it('empty: says no prices set and shows Not offered placeholders', async () => {
    setup(always());
    expect(await screen.findByText(/haven't set any prices yet/)).toBeInTheDocument();
    expect(screen.getAllByPlaceholderText('Not offered').length).toBe(9);
  });

  it('error: load failure offers retry', async () => {
    server.use(
      getOwnerSpacesGetMockHandler(space),
      http.get('*/api/owner/spaces/s1/pricing', () =>
        HttpResponse.json({ status: 500 }, { status: 500 }),
      ),
    );
    renderWithQuery(<PricingForm spaceId="s1" />);
    expect(await screen.findByText("We couldn't load prices")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('fixed hours: only Working hours, no checkbox, no shift field', async () => {
    setup(fixed, {
      ...space,
      openingHours: { mode: 'fixed_hours', opensAt: '09:00', closesAt: '18:00' },
    });
    expect(await screen.findByRole('group', { name: 'Working hours' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Shift change time')).not.toBeInTheDocument();
    expect(screen.getByText(/always offered/)).toBeInTheDocument();
    expect(screen.getByLabelText('Day pass price in INR')).toHaveValue('500.00');
  });

  it('24-hour: changing the shift updates the derived times before saving', async () => {
    setup(always());
    const shift = await screen.findByLabelText('Shift change time');
    expect(screen.getByText('07:00 to 19:00')).toBeInTheDocument();
    await userEvent.clear(shift);
    await userEvent.type(shift, '08:30');
    expect(screen.getByText('08:30 to 20:30')).toBeInTheDocument();
    expect(screen.getByText('20:30 to 08:30 next day')).toBeInTheDocument();
  });

  it('an off slot keeps its price inputs enabled', async () => {
    setup(always());
    await screen.findByLabelText('Shift change time');
    expect(screen.getAllByText(/Its prices are kept/).length).toBe(2);
    const night = screen.getByRole('group', { name: 'Night' });
    expect(night.querySelector('input[type=text]')).toBeEnabled();
  });

  it('invalid price: shows the field error and sends no request', async () => {
    let called = false;
    setup(always());
    server.use(
      http.put('*/api/owner/spaces/s1/pricing', () => {
        called = true;
        return HttpResponse.json(always());
      }),
    );
    const day = await screen.findByLabelText('Day pass price in INR', {
      selector: '#day-day',
    });
    await userEvent.type(day, '12.345');
    await userEvent.click(screen.getByRole('button', { name: 'Save prices' }));
    expect(await screen.findByText('Use at most two decimal places')).toBeInTheDocument();
    expect(day).toHaveAttribute('aria-invalid', 'true');
    expect(day.getAttribute('aria-describedby')).toContain('day-day-error');
    await userEvent.clear(day);
    await userEvent.type(day, '0');
    await userEvent.click(screen.getByRole('button', { name: 'Save prices' }));
    expect(await screen.findByText('Enter a price greater than zero')).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('saves every slot with null for empty prices, then shows success and the response values', async () => {
    let body: unknown;
    setup(always());
    server.use(
      http.put('*/api/owner/spaces/s1/pricing', async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(always({ day: '1500.50', week: null, month: null }));
      }),
    );
    const day = await screen.findByLabelText('Day pass price in INR', { selector: '#day-day' });
    await userEvent.type(day, '1500.5');
    expect(screen.getByText('Shows as ₹1,500.50')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save prices' }));
    expect(await screen.findByText('Prices saved')).toBeInTheDocument();
    expect(body).toEqual({
      shiftChangeAt: '07:00',
      slots: [
        { slot: 'day', enabled: true, prices: { day: '1500.5', week: null, month: null } },
        { slot: 'night', enabled: false, prices: none },
        { slot: 'full_day', enabled: false, prices: none },
      ],
    });
    await waitFor(() => expect(day).toHaveValue('1500.50'));
  });

  it('a 400 with a plain message shows it in the alert', async () => {
    setup(always());
    server.use(
      http.put('*/api/owner/spaces/s1/pricing', () =>
        HttpResponse.json(
          {
            type: 'about:blank',
            status: 400,
            title: 'Bad Request',
            detail: 'slots must be day, night, full_day',
          },
          { status: 400 },
        ),
      ),
    );
    await screen.findByLabelText('Shift change time');
    await userEvent.click(screen.getByRole('button', { name: 'Save prices' }));
    expect(await screen.findByText("We couldn't save your prices")).toBeInTheDocument();
    expect(screen.getByText('slots must be day, night, full_day')).toBeInTheDocument();
  });
});
