import { getSpacesListMockHandler } from '@bseat/api-client/mocks';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw';
import { twoSpaces } from '@/test/fixtures';
import { renderWithQuery } from '@/test/render';

import BookPage, { metadata } from './page';

describe('/book page', () => {
  it('has a metadata title, one h1, main#main', async () => {
    server.use(getSpacesListMockHandler(twoSpaces));
    const { container } = renderWithQuery(<BookPage />);

    expect(metadata.title).toBe('Book a seat');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Book a seat' })).toBeInTheDocument();
    expect(container.querySelector('main#main')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: 'London HQ' })).toBeInTheDocument();
  });
});
