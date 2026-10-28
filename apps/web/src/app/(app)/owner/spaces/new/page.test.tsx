import { getReferenceGetMockHandler } from '@bseat/api-client/mocks';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import NewSpacePage, { metadata } from './page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/owner/spaces/new',
}));

describe('/owner/spaces/new page', () => {
  it('has a metadata title, one h1, main#main and the required-fields note', () => {
    server.use(getReferenceGetMockHandler({ countries: [], currencies: [], utilities: [] }));
    const { container } = renderWithQuery(<NewSpacePage />);

    expect(metadata.title).toBe('List a space');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'List a space' })).toBeInTheDocument();
    expect(container.querySelector('main#main')).not.toBeNull();
    expect(screen.getByText('All fields are required unless marked optional.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create space' })).toBeInTheDocument();
  });
});
