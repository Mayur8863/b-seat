import { getSpacesListMockHandler } from '@bseat/api-client/mocks';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { problemResponse, twoSpaces } from '@/test/fixtures';
import { renderWithQuery } from '@/test/render';

import { SpaceList } from './space-list';

describe('SpaceList', () => {
  it('shows a loading state, then hands the spaces to its child', async () => {
    server.use(getSpacesListMockHandler(twoSpaces));
    const render = vi.fn(() => <p>form here</p>);
    renderWithQuery(<SpaceList>{render}</SpaceList>);

    expect(screen.getByText('Loading office spaces…')).toBeInTheDocument();
    expect(await screen.findByText('form here')).toBeInTheDocument();
    expect(render).toHaveBeenCalledWith(twoSpaces.items);
  });

  it('shows the empty state without a form', async () => {
    server.use(getSpacesListMockHandler({ items: [] }));
    renderWithQuery(<SpaceList>{() => <p>form here</p>}</SpaceList>);

    expect(await screen.findByText('There are no office spaces to book yet.')).toBeInTheDocument();
    expect(screen.queryByText('form here')).not.toBeInTheDocument();
  });

  it('shows an error alert with a working Try again button', async () => {
    server.use(http.get('*/api/spaces', () => problemResponse(500, 'http-500')));
    const { container } = renderWithQuery(<SpaceList>{() => <p>form here</p>}</SpaceList>);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't load office spaces");
    expect(alert).toHaveTextContent('Try again in a moment');
    expect(container).not.toHaveTextContent('form here');

    server.use(getSpacesListMockHandler(twoSpaces));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('form here')).toBeInTheDocument();
  });

  it('keeps the form when a later refetch fails', async () => {
    server.use(getSpacesListMockHandler(twoSpaces));
    const { client } = renderWithQuery(<SpaceList>{() => <p>form here</p>}</SpaceList>);
    await screen.findByText('form here');

    server.use(http.get('*/api/spaces', () => problemResponse(500, 'http-500')));
    await client.invalidateQueries();

    await waitFor(() => {
      expect(client.isFetching()).toBe(0);
    });
    expect(screen.getByText('form here')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
