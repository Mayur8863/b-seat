import { getOwnerSpacesGetMockHandler } from '@bseat/api-client/mocks';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { SpaceShell } from './space-shell';

vi.mock('next/navigation', () => ({ usePathname: () => '/owner/spaces/s1' }));

const space = {
  id: 's1',
  status: 'draft',
  name: 'Hub One',
} as never;

const render = () =>
  renderWithQuery(
    <SpaceShell spaceId="s1">
      <p>child content</p>
    </SpaceShell>,
  );

describe('SpaceShell', () => {
  it('loading: busy main, no children', () => {
    server.use(getOwnerSpacesGetMockHandler(space));
    render();
    expect(screen.getByText('Loading space…')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Loading' })).toBeInTheDocument();
    expect(screen.queryByText('child content')).not.toBeInTheDocument();
  });

  it('success: name, status, sub-nav and children', async () => {
    server.use(getOwnerSpacesGetMockHandler(space));
    render();
    expect(await screen.findByText('child content')).toBeInTheDocument();
    expect(screen.getByText('Hub One')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Space management' })).toBeInTheDocument();
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toContainElement(screen.getByText('child content'));
  });

  it('404: identical not-found state, no children', async () => {
    server.use(
      http.get('*/api/owner/spaces/s1', () =>
        HttpResponse.json({ status: 404, title: 'Not Found' }, { status: 404 }),
      ),
    );
    render();
    expect(
      await screen.findByRole('heading', { name: "We couldn't find that space" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toHaveAttribute(
      'href',
      '/dashboard',
    );
    expect(screen.queryByText('child content')).not.toBeInTheDocument();
  });

  it('error: alert with retry', async () => {
    server.use(http.get('*/api/owner/spaces/s1', () => HttpResponse.json({}, { status: 500 })));
    render();
    expect(
      await screen.findByRole('heading', { name: "We couldn't load this space" }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
