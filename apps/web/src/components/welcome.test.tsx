import { getMeGetMockHandler } from '@bseat/api-client/mocks';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { Welcome } from './welcome';

describe('Welcome', () => {
  it('shows a loading state, then greets the user', async () => {
    server.use(
      getMeGetMockHandler({ id: 'u1', name: 'Ada', email: 'ada@example.com', emailVerified: true }),
    );
    renderWithQuery(<Welcome />);

    expect(screen.getByText('Loading your profile…')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Welcome, Ada' })).toBeInTheDocument();
  });

  it('shows an error when the profile cannot be loaded', async () => {
    server.use(
      http.get('*/api/me', () =>
        HttpResponse.json(
          { type: 'urn:bseat:problem:http-401', title: 'unauthorized', status: 401 },
          { status: 401, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    renderWithQuery(<Welcome />);

    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load your profile.");
  });
});
