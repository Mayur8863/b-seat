import { getSpacesListMockHandler } from '@bseat/api-client/mocks';
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw';
import { twoSpaces } from '@/test/fixtures';
import { renderWithQuery } from '@/test/render';

import BookPage, { metadata } from './page';

describe('/book page', () => {
  it('has a metadata title, one h1, main#main and a link back to the dashboard', async () => {
    server.use(getSpacesListMockHandler(twoSpaces));
    const { container } = renderWithQuery(<BookPage />);

    expect(metadata.title).toBe('Book a seat');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Book a seat' })).toBeInTheDocument();
    expect(container.querySelector('main#main')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(await screen.findByRole('radio', { name: 'London HQ' })).toBeInTheDocument();
  });
});
