import { getMeGetMockHandler } from '@bseat/api-client/mocks';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ usePathname: () => '/owner/spaces/s1/seats' }));

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { OwnerGate } from './owner-gate';

const me = (accountType: 'owner' | 'renter') =>
  getMeGetMockHandler({
    id: 'u1',
    name: 'Sam',
    email: 'sam@example.com',
    emailVerified: true,
    accountType,
    preferences: null,
  });

describe('OwnerGate', () => {
  it('shows a busy status while loading', () => {
    server.use(me('owner'));
    renderWithQuery(<OwnerGate>secret</OwnerGate>);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders children for an owner', async () => {
    server.use(me('owner'));
    renderWithQuery(<OwnerGate>secret</OwnerGate>);
    expect(await screen.findByText('secret')).toBeInTheDocument();
  });

  it('keeps a renter out and links to the dashboard', async () => {
    server.use(me('renter'));
    renderWithQuery(<OwnerGate>secret</OwnerGate>);
    expect(await screen.findByText('This area is for space owners')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
  });

  it('asks for sign-in again when the session has expired', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json({ status: 401 }, { status: 401 })));
    renderWithQuery(<OwnerGate>secret</OwnerGate>);
    expect(await screen.findByText('Your session has ended')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in?next=%2Fowner%2Fspaces%2Fs1%2Fseats',
    );
    expect(screen.queryByText('Owners only')).not.toBeInTheDocument();
  });

  it('shows an error with retry when the account cannot be loaded', async () => {
    server.use(http.get('*/api/me', () => HttpResponse.json({ status: 500 }, { status: 500 })));
    renderWithQuery(<OwnerGate>secret</OwnerGate>);
    expect(await screen.findByText("We couldn't check your account")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
