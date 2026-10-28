import { getMeGetMockHandler, getReferenceGetMockHandler } from '@bseat/api-client/mocks';
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@bseat/ui/components/sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from '@bseat/ui/components/sonner';

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

const reference = getReferenceGetMockHandler({
  countries: [{ code: 'IN', name: 'India', timeZones: ['Asia/Kolkata'] }],
  currencies: [],
  utilities: [],
});

describe('DashboardView', () => {
  beforeEach(() => {
    server.use(reference);
  });

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

  describe('preferences card (renter)', () => {
    const meWith = (
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

    it('empty: muted text and an Add preferences button', async () => {
      server.use(meWith(null));
      renderWithQuery(<DashboardView />);
      const section = await screen.findByRole('region', { name: 'Your preferences' });
      expect(within(section).getByText(/You haven't set a preferred location/)).toBeInTheDocument();
      expect(within(section).getByRole('button', { name: 'Add preferences' })).toBeInTheDocument();
    });

    it('view: shows the country name, city and area', async () => {
      server.use(meWith({ country: 'IN', city: 'Pune', area: null }));
      renderWithQuery(<DashboardView />);
      const section = await screen.findByRole('region', { name: 'Your preferences' });
      expect(await within(section).findByText('India')).toBeInTheDocument();
      expect(within(section).getByText('Pune')).toBeInTheDocument();
      expect(within(section).getByText('Any')).toBeInTheDocument();
      expect(within(section).getByRole('button', { name: 'Edit preferences' })).toBeInTheDocument();
    });

    it('view: falls back to the stored country code when the reference fails', async () => {
      server.use(
        meWith({ country: 'IN', city: null, area: null }),
        http.get('*/api/reference', () => HttpResponse.json({ status: 500 }, { status: 500 })),
      );
      renderWithQuery(<DashboardView />);
      const section = await screen.findByRole('region', { name: 'Your preferences' });
      expect(await within(section).findByText('IN')).toBeInTheDocument();
    });

    it('edit then save: success toast, view mode, and /api/me is refetched', async () => {
      let stored = {
        country: null as string | null,
        city: null as string | null,
        area: null as string | null,
      };
      server.use(
        http.get('*/api/me', () =>
          HttpResponse.json({
            id: 'u1',
            name: 'Ada',
            email: 'ada@example.com',
            emailVerified: true,
            accountType: 'renter',
            preferences: stored,
          }),
        ),
        http.put('*/api/me/preferences', async ({ request }) => {
          stored = (await request.json()) as typeof stored;
          return HttpResponse.json(stored);
        }),
      );
      renderWithQuery(<DashboardView />);
      await userEvent.click(await screen.findByRole('button', { name: 'Add preferences' }));
      await userEvent.type(screen.getByLabelText('City'), 'Pune');
      await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }));
      const edit = await screen.findByRole('button', { name: 'Edit preferences' });
      expect(toast.success).toHaveBeenCalledWith('Preferences saved');
      expect(screen.getByText('Pune')).toBeInTheDocument();
      await waitFor(() => {
        expect(edit).toHaveFocus();
      });
    });

    it('Cancel returns to view mode with focus on the edit button', async () => {
      server.use(meWith({ country: null, city: 'Pune', area: null }));
      renderWithQuery(<DashboardView />);
      await userEvent.click(await screen.findByRole('button', { name: 'Edit preferences' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Edit preferences' })).toHaveFocus();
      });
    });

    it('owners never see the preferences card', async () => {
      server.use(me('owner'));
      renderWithQuery(<DashboardView />);
      await screen.findByRole('heading', { name: 'My spaces' });
      expect(screen.queryByRole('region', { name: 'Your preferences' })).not.toBeInTheDocument();
    });
  });
});
