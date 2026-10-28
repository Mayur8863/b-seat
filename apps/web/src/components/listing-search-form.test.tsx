import {
  getListingsSearchMockHandler,
  getMeGetMockHandler,
  getReferenceGetMockHandler,
} from '@bseat/api-client/mocks';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { ListingSearchForm } from './listing-search-form';

const push = vi.fn();
const replace = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(search),
}));

const reference = getReferenceGetMockHandler({
  countries: [
    { code: 'IN', name: 'India', timeZones: ['Asia/Kolkata'] },
    { code: 'GB', name: 'United Kingdom', timeZones: ['Europe/London'] },
  ],
  currencies: [],
  utilities: [],
});
const me = (
  preferences: { country: string | null; city: string | null; area: string | null } | null,
) =>
  getMeGetMockHandler({
    id: 'u1',
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: true,
    accountType: 'renter',
    preferences,
  });
const hub = {
  id: 's1',
  name: 'Hub One',
  country: 'IN',
  city: 'Pune',
  area: 'Baner',
  utilities: ['wifi' as const],
  customUtilities: [],
  currency: 'INR',
  lowestPrices: { day: '300.00', week: '1800.00', month: null },
  hasLayout: true,
};

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  search = '';
});

describe('ListingSearchForm', () => {
  it('prefills from preferences, puts them in the URL and shows the start state before', async () => {
    server.use(reference, me({ country: 'IN', city: 'Pune', area: null }));
    renderWithQuery(<ListingSearchForm />);
    expect(screen.getByText('Choose a country to see spaces.')).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/find?country=IN&city=Pune');
    });
    expect(await screen.findByLabelText('Country')).toHaveValue('IN');
    expect(screen.getByRole('combobox', { name: 'City (optional)' })).toHaveValue('Pune');
  });

  it('ignores a stored country that is not in the reference list', async () => {
    server.use(reference, me({ country: 'ZZ', city: null, area: null }));
    renderWithQuery(<ListingSearchForm />);
    await screen.findByRole('option', { name: 'India' });
    await new Promise((r) => setTimeout(r, 30));
    expect(replace).not.toHaveBeenCalled();
  });

  it('requires a country: shows the error, focuses Country, no search', async () => {
    const user = userEvent.setup();
    server.use(reference, me(null));
    renderWithQuery(<ListingSearchForm />);
    await screen.findByRole('option', { name: 'India' });
    await user.click(screen.getByRole('button', { name: 'Search' }));
    const country = screen.getByLabelText('Country');
    expect(await screen.findByText('Choose a country.')).toBeInTheDocument();
    expect(country).toHaveFocus();
    expect(country).toHaveAccessibleDescription('Choose a country.');
    expect(push).not.toHaveBeenCalled();
  });

  it('searches on submit with every filter in the URL', async () => {
    const user = userEvent.setup();
    server.use(reference, me(null));
    renderWithQuery(<ListingSearchForm />);
    await screen.findByRole('option', { name: 'India' });
    await user.selectOptions(screen.getByLabelText('Country'), 'IN');
    await user.type(screen.getByRole('combobox', { name: 'City (optional)' }), 'Pune');
    await user.selectOptions(screen.getByLabelText('Pass (optional)'), 'week');
    await user.selectOptions(screen.getByLabelText('Slot (optional)'), 'night');
    await user.click(screen.getByRole('checkbox', { name: 'Wi-Fi' }));
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(push).toHaveBeenCalledWith(
      '/find?country=IN&city=Pune&pass=week&slot=night&utilities=wifi',
    );
  });

  it('rejects a start date outside the window', async () => {
    const user = userEvent.setup();
    server.use(reference, me(null));
    renderWithQuery(<ListingSearchForm />);
    await screen.findByRole('option', { name: 'India' });
    await user.selectOptions(screen.getByLabelText('Country'), 'IN');
    await user.type(screen.getByLabelText('Start date (optional)'), '2020-01-01');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Choose a date within the next 30 days.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows results for the URL and counts the set extra filters on the disclosure', async () => {
    search = 'country=IN&city=Pune&pass=week&utilities=wifi';
    server.use(
      reference,
      me(null),
      getListingsSearchMockHandler({ items: [hub], nextCursor: null }),
    );
    renderWithQuery(<ListingSearchForm />);
    const link = await screen.findByRole('link', { name: 'Hub One' });
    expect(link).toHaveAttribute(
      'href',
      '/spaces/s1?country=IN&city=Pune&pass=week&utilities=wifi',
    );
    expect(screen.getByRole('button', { name: 'More filters (2)' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(await screen.findByText('1 space in Pune, India')).toBeInTheDocument();
  });

  it('Clear filters empties the form and the URL', async () => {
    const user = userEvent.setup();
    search = 'country=IN&city=Pune';
    server.use(
      reference,
      me(null),
      getListingsSearchMockHandler({ items: [hub], nextCursor: null }),
    );
    renderWithQuery(<ListingSearchForm />);
    await screen.findByRole('link', { name: 'Hub One' });
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(push).toHaveBeenCalledWith('/find');
    await vi.waitFor(() => {
      expect(screen.getByLabelText('Country')).toHaveFocus();
    });
    expect(screen.getByRole('combobox', { name: 'City (optional)' })).toHaveValue('');
  });

  it('selects the country from the URL once the list has loaded', async () => {
    search = 'country=GB&city=Probeville';
    server.use(reference, me(null), getListingsSearchMockHandler({ items: [], nextCursor: null }));
    renderWithQuery(<ListingSearchForm />);
    await screen.findByRole('option', { name: 'United Kingdom' });
    expect(screen.getByLabelText('Country')).toHaveValue('GB');
  });
});
