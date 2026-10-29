import type { OwnerSpacePhoto, OwnerSpacePhotos } from '@bseat/api-client';
import { getOwnerSpacesGetMockHandler } from '@bseat/api-client/mocks';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { SpacePhotoManager } from './space-photo-manager';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const photo = (n: number): OwnerSpacePhoto => ({
  id: `p${n}`,
  position: n,
  description: null,
  altText: `Hub photo ${n}`,
  card: { url: `https://img.test/${n}.webp`, width: 640, height: 480 },
  display: { url: `https://img.test/${n}d.webp`, width: 1600, height: 1200 },
  createdAt: '2026-01-01T00:00:00Z',
});
const list = (ids: number[]): OwnerSpacePhotos => ({
  items: ids.map((n, i) => ({ ...photo(n), position: i + 1 })),
  limit: 10,
  photoUrlsExpireAt: null,
});

function serve(ids: number[]) {
  server.use(
    getOwnerSpacesGetMockHandler({ id: 's1', name: 'Hub', status: 'published' } as never),
    http.get('/api/owner/spaces/s1/photos', () => HttpResponse.json(list(ids))),
  );
}
const cards = () =>
  within(screen.getByRole('list', { name: 'Photos in order' })).getAllByRole('listitem');

describe('photo reorder and delete', () => {
  it('offers no reorder controls for a single photo', async () => {
    serve([1]);
    renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    await screen.findByText('1 of 10 photos');
    expect(screen.queryByRole('button', { name: /Move|Make cover/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument();
  });

  it('makes the 4th photo the cover from the keyboard, keeps focus and announces it', async () => {
    serve([1, 2, 3, 4, 5]);
    let sent: unknown;
    server.use(
      http.put('/api/owner/spaces/s1/photos/order', async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(list([4, 1, 2, 3, 5]));
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    await screen.findByText('5 of 10 photos');
    const make = within(cards()[3]!).getByRole('button', { name: /Make cover/ });
    make.focus();
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(document.body.textContent).toContain(
        'Photo moved to position 1 of 5. It is now the cover.',
      );
    });
    expect(sent).toEqual({ photoIds: ['p4', 'p1', 'p2', 'p3', 'p5'] });
    expect(within(cards()[0]!).getByText('Cover')).toBeInTheDocument();
    // Make cover no longer applies at position 1, so focus falls to the card's first button.
    await waitFor(() => {
      expect(document.activeElement?.closest('article')?.textContent).toContain('Photo 1');
    });
  });

  it('restores the order and shows the stale message on a 409', async () => {
    serve([1, 2, 3]);
    server.use(
      http.put('/api/owner/spaces/s1/photos/order', () =>
        HttpResponse.json(
          { type: 'urn:bseat:problem:photo:order-stale', status: 409 },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    await screen.findByText('3 of 10 photos');
    await user.click(within(cards()[2]!).getByRole('button', { name: /Move earlier/ }));
    expect(await screen.findByText('These photos changed')).toBeInTheDocument();
    expect(within(cards()[2]!).getByRole('heading', { name: 'Photo 3' })).toBeInTheDocument();
  });

  it('deletes after confirming, then focuses the photo now at that position', async () => {
    serve([1, 2, 3]);
    let removed = false;
    server.use(
      http.delete('/api/owner/spaces/s1/photos/p2', () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    await screen.findByText('3 of 10 photos');
    await user.click(within(cards()[1]!).getByRole('button', { name: /Delete/ }));
    expect(await screen.findByText(/Photo 2 will be deleted permanently/)).toHaveTextContent(
      "This can't be undone.",
    );
    server.use(http.get('/api/owner/spaces/s1/photos', () => HttpResponse.json(list([1, 3]))));
    await user.click(screen.getByRole('button', { name: 'Delete photo' }));
    await waitFor(() => {
      expect(cards()).toHaveLength(2);
    });
    expect(removed).toBe(true);
    expect(document.body.textContent).toContain('Photo deleted. 2 of 10 photos.');
    await waitFor(() => {
      expect(document.activeElement?.id).toBe('photo-p3-heading');
    });
  });

  it('keeps the photo and returns focus to Delete when the owner keeps it', async () => {
    serve([1, 2]);
    const user = userEvent.setup();
    renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    await screen.findByText('2 of 10 photos');
    const del = within(cards()[0]!).getByRole('button', { name: /Delete/ });
    await user.click(del);
    expect(await screen.findByText(/The next photo becomes the cover/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep photo' }));
    await waitFor(() => {
      expect(del).toHaveFocus();
    });
    expect(cards()).toHaveLength(2);
  });
});
