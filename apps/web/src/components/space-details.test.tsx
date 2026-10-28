import type { OwnerSpace } from '@bseat/api-client';
import { getOwnerSpacesGetMockHandler, getReferenceGetMockHandler } from '@bseat/api-client/mocks';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { SpaceDetails } from './space-details';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/owner/spaces/s1',
}));

const base = {
  id: 's1',
  name: 'Hub One',
  description: 'Desk space',
  country: 'IN',
  city: 'Pune',
  area: 'Baner',
  streetAddress: '1 Road',
  timeZone: 'Asia/Kolkata',
  currency: 'INR',
  utilities: [],
  customUtilities: [],
  openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
} as const;
const space = (status: string) => ({ ...base, status }) as unknown as OwnerSpace;

const setup = (status: string) => {
  server.use(
    getReferenceGetMockHandler({
      countries: [{ code: 'IN', name: 'India', timeZones: ['Asia/Kolkata'] }],
      currencies: [{ code: 'INR', name: 'Indian rupee' }],
    } as never),
    getOwnerSpacesGetMockHandler(space(status)),
  );
  return renderWithQuery(<SpaceDetails spaceId="s1" />);
};

describe('SpaceDetails', () => {
  it('draft: shows the publishing card and the form', async () => {
    setup('draft');
    expect(await screen.findByRole('heading', { name: 'Details' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Publishing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Name')).toHaveValue('Hub One');
  });

  it('publish refused: lists what is missing', async () => {
    setup('draft');
    server.use(
      http.post('*/api/owner/spaces/s1/publish', () =>
        HttpResponse.json(
          {
            type: 'urn:bseat:problem:listing:publish-incomplete',
            title: 'x',
            status: 422,
            missing: ['seat', 'pricedPass'],
          },
          { status: 422 },
        ),
      ),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(await screen.findByText("Add what's missing to publish")).toBeInTheDocument();
    expect(screen.getByText('Add at least one seat')).toBeInTheDocument();
    expect(screen.getByText('Price at least one pass')).toBeInTheDocument();
  });

  it('publish succeeds: status line and Unpublish button', async () => {
    setup('draft');
    server.use(getOwnerSpacesPublishHandler());
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Published. Renters can now find this space.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Unpublish' })).toBeInTheDocument();
  });

  it('unpublish: confirms in a dialog first', async () => {
    setup('published');
    server.use(
      http.post('*/api/owner/spaces/s1/unpublish', () => HttpResponse.json(space('unpublished'))),
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish' }));
    expect(screen.getByText('Unpublish this space?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Unpublish' }));
    expect(await screen.findByText('Unpublished. This space is hidden from search.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('error: alert with retry', async () => {
    server.use(http.get('*/api/owner/spaces/s1', () => HttpResponse.json({}, { status: 500 })));
    renderWithQuery(<SpaceDetails spaceId="s1" />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});

function getOwnerSpacesPublishHandler() {
  return http.post('*/api/owner/spaces/s1/publish', () => HttpResponse.json(space('published')));
}
