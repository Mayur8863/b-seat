import { getMeGetMockHandler } from '@bseat/api-client/mocks';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { DashboardView } from './dashboard-view';

const me = (accountType: 'renter' | 'owner') =>
  getMeGetMockHandler({
    id: 'u1',
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: true,
    accountType,
    preferences: null,
  });

describe('DashboardView', () => {
  it('shows the h1 and a busy loading state while loading', () => {
    server.use(me('renter'));
    renderWithQuery(<DashboardView />);
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText('Loading your dashboard…')).toBeInTheDocument();
  });

  it('shows only the h1 when /api/me fails (the shell explains)', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json({ status: 500 }, { status: 500 })));
    renderWithQuery(<DashboardView />);
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    await waitFor(() => {
      expect(screen.queryByText('Loading your dashboard…')).not.toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renter: greeting, Find a space links and a neutral next-booking card', async () => {
    server.use(me('renter'));
    renderWithQuery(<DashboardView />);
    expect(await screen.findByText('Signed in as Ada')).toBeInTheDocument();
    const quick = screen.getByRole('navigation', { name: 'Quick links' });
    expect(within(quick).getByRole('link', { name: 'Find a space' })).toHaveAttribute(
      'href',
      '/book',
    );
    const section = screen.getByRole('region', { name: 'Next booking' });
    expect(within(section).getByText(/Find a space and book a seat/)).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Find a space' })).toHaveAttribute(
      'href',
      '/book',
    );
    expect(screen.queryByRole('heading', { name: 'My spaces' })).not.toBeInTheDocument();
  });

  it('owner: My spaces heading with the placeholder slot, no next booking', async () => {
    server.use(me('owner'));
    renderWithQuery(<DashboardView />);
    expect(await screen.findByRole('heading', { level: 2, name: 'My spaces' })).toBeInTheDocument();
    expect(screen.getByText('Your spaces will appear here.')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Next booking' })).not.toBeInTheDocument();
  });
});
