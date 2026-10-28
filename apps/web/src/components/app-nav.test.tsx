import { getMeGetMockHandler } from '@bseat/api-client/mocks';
import { QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { AppNav } from './app-nav';

let pathname = '/dashboard';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn() }),
}));

const me = (accountType: 'renter' | 'owner') =>
  getMeGetMockHandler({
    id: 'u1',
    name: 'Ada',
    email: 'ada@example.com',
    emailVerified: true,
    accountType,
    preferences: null,
  });

const problem = (status: number) =>
  http.get('*/api/me', () =>
    HttpResponse.json(
      { type: `urn:bseat:problem:http-${status}`, title: 'x', status },
      { status, headers: { 'content-type': 'application/problem+json' } },
    ),
  );

beforeEach(() => {
  pathname = '/dashboard';
});

describe('AppNav', () => {
  it('shows a busy loading state while /api/me loads', () => {
    server.use(me('renter'));
    renderWithQuery(<AppNav />);
    expect(screen.getByRole('navigation', { name: 'Main' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading navigation…')).toBeInTheDocument();
  });

  it.each(['renter', 'owner'] as const)(
    'shows the %s links with aria-current on the active one',
    async (role) => {
      server.use(me(role));
      renderWithQuery(<AppNav />);
      const nav = screen.getByRole('navigation', { name: 'Main' });
      const dashboard = await within(nav).findByRole('link', { name: 'Dashboard' });
      expect(dashboard).toHaveAttribute('aria-current', 'page');
      const find = within(nav).getByRole('link', { name: 'Find a space' });
      expect(find).toHaveAttribute('href', '/find');
      expect(find).not.toHaveAttribute('aria-current');
      expect(screen.getByText('Ada')).toBeInTheDocument();
    },
  );

  it('shows List a space to owners only', async () => {
    server.use(me('owner'));
    const { unmount } = renderWithQuery(<AppNav />);
    expect(await screen.findByRole('link', { name: 'List a space' })).toHaveAttribute(
      'href',
      '/owner/spaces/new',
    );
    unmount();
    server.use(me('renter'));
    renderWithQuery(<AppNav />);
    await screen.findByRole('link', { name: 'Find a space' });
    expect(screen.queryByRole('link', { name: 'List a space' })).not.toBeInTheDocument();
  });

  it('marks the area link current with true on a parent path', async () => {
    pathname = '/owner/spaces/abc/seats';
    server.use(me('owner'));
    renderWithQuery(<AppNav />);
    expect(await screen.findByRole('link', { name: 'Dashboard' })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(document.querySelectorAll('[aria-current]')).toHaveLength(1);
  });

  it('on a non-auth error keeps Dashboard and Sign out, explains and offers retry', async () => {
    server.use(problem(500));
    renderWithQuery(<AppNav />);
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your account");
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Find a space' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('on 401 shows only a sign-in link carrying the current path', async () => {
    pathname = '/book';
    server.use(problem(401));
    renderWithQuery(<AppNav />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Your session has ended');
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in?next=%2Fbook',
    );
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
  });

  it('toggles the mobile menu, and Escape closes it and refocuses the toggle', async () => {
    server.use(me('renter'));
    const user = userEvent.setup();
    renderWithQuery(<AppNav />);
    await screen.findByRole('link', { name: 'Dashboard' });
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAttribute('aria-controls', 'main-nav-list');
    await user.tab();
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();
  });

  it('closes the menu when a link is clicked', async () => {
    server.use(me('renter'));
    const user = userEvent.setup();
    renderWithQuery(<AppNav />);
    const toggle = screen.getByRole('button', { name: 'Menu' });
    await user.click(toggle);
    await user.click(await screen.findByRole('link', { name: 'Find a space' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the menu when the pathname changes', async () => {
    pathname = '/dashboard';
    server.use(me('renter'));
    const user = userEvent.setup();
    const view = renderWithQuery(<AppNav />);
    const toggle = screen.getByRole('button', { name: 'Menu' });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    pathname = '/book';
    view.rerender(
      <QueryClientProvider client={view.client}>
        <AppNav />
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    });
  });

  it('keeps the cached nav when a background refetch fails with a non-401 error', async () => {
    server.use(me('renter'));
    const { client: queryClient } = renderWithQuery(<AppNav />);
    await screen.findByRole('link', { name: 'Find a space' });
    server.use(problem(500));
    await queryClient.refetchQueries();
    await waitFor(() => {
      expect(queryClient.isFetching()).toBe(0);
    });
    expect(screen.getByRole('link', { name: 'Find a space' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
