import { getSpacesListMockHandler } from '@bseat/api-client/mocks';
import { screen } from '@testing-library/react';
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
    screen.getByRole('button', { name: 'Try again' }).click();
    expect(await screen.findByText('form here')).toBeInTheDocument();
  });
});
