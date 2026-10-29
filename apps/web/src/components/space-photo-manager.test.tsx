import { ApiError, type OwnerSpacePhoto, type OwnerSpacePhotos } from '@bseat/api-client';
import {
  getOwnerSpacesGetMockHandler,
  getSpacePhotosListMockHandler,
} from '@bseat/api-client/mocks';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Link from 'next/link';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/test/msw';
import { renderWithQuery } from '@/test/render';

import { SpacePhotoManager } from './space-photo-manager';

const upload = vi.hoisted(() => vi.fn());
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@bseat/api-client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  uploadSpacePhoto: upload,
}));

const photo = (n: number): OwnerSpacePhoto => ({
  id: `p${n}`,
  position: n,
  description: null,
  altText: `Desk photo ${n}`,
  card: { url: `https://img.test/${n}.webp`, width: 640, height: 480 },
  display: { url: `https://img.test/${n}d.webp`, width: 1600, height: 1200 },
  createdAt: '2026-01-01T00:00:00Z',
});
const list = (n: number): OwnerSpacePhotos => ({
  items: Array.from({ length: n }, (_, i) => photo(i + 1)),
  limit: 10,
  photoUrlsExpireAt: null,
});
const space = { id: 's1', status: 'published' } as never;

function serve(n: number) {
  server.use(getOwnerSpacesGetMockHandler(space), getSpacePhotosListMockHandler(list(n)));
}
const png = (name: string) => new File(['x'], name, { type: 'image/png' });

beforeEach(() => {
  upload.mockReset();
  push.mockReset();
});

describe('SpacePhotoManager', () => {
  it('shows a loading state, then the empty state with the rules', async () => {
    serve(0);
    renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    expect(screen.getByText('Loading photos…')).toBeInTheDocument();
    expect(await screen.findByText('Add photos of your space')).toBeInTheDocument();
    expect(screen.getByText('0 of 10 photos')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Photos', level: 1 })).toBeInTheDocument();
  });

  it('shows an error with Try again', async () => {
    server.use(
      getOwnerSpacesGetMockHandler(space),
      http.get('/api/owner/spaces/s1/photos', () => HttpResponse.json({}, { status: 500 })),
    );
    const user = userEvent.setup();
    renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    expect(await screen.findByText("We couldn't load your photos")).toBeInTheDocument();
    server.use(getSpacePhotosListMockHandler(list(1)));
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Photo 1' })).toBeInTheDocument();
  });

  it('lists photos in order with the cover badge and the count', async () => {
    serve(7);
    renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    expect(await screen.findByText('7 of 10 photos')).toBeInTheDocument();
    const items = within(screen.getByRole('list', { name: 'Photos in order' })).getAllByRole(
      'listitem',
    );
    expect(items).toHaveLength(7);
    expect(within(items[0]!).getByText('Cover')).toBeInTheDocument();
    expect(within(items[1]!).queryByText('Cover')).not.toBeInTheDocument();
    expect(screen.getByText('You can add 3 more.')).toBeInTheDocument();
  });

  it('disables Add photos at 10 with the limit message', async () => {
    serve(10);
    renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    const add = await screen.findByRole('button', { name: 'Add photos' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(add).toHaveAttribute('aria-describedby', 'photo-limit-note');
    expect(screen.getByText('This space has the maximum of 10 photos')).toBeInTheDocument();
  });

  it('uploads three files, shows progress and announces each', async () => {
    serve(0);
    upload.mockImplementation(
      (_id: string, _f: File, o: { onProgress: (n: number) => void; onProcessing: () => void }) => {
        o.onProgress(0.5);
        o.onProcessing();
        return Promise.resolve(photo(1));
      },
    );
    const user = userEvent.setup();
    const { container } = renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    await screen.findByText('0 of 10 photos');
    const input = container.querySelector<HTMLInputElement>('input[type=file]')!;
    await user.upload(input, [png('a.png'), png('b.png'), png('c.png')]);
    await waitFor(() => {
      expect(screen.getAllByText('Added')).toHaveLength(3);
    });
    expect(upload).toHaveBeenCalledTimes(3);
    expect(upload.mock.calls[0]?.[0]).toBe('s1');
    await waitFor(() => {
      expect(screen.getByRole('status', { hidden: false, name: '' })).toBeDefined();
    });
    await waitFor(() => {
      expect(document.body.textContent).toContain('3 of 3 photos added.');
    });
  });

  it('shows a failed row with the problem copy, Retry and Dismiss', async () => {
    serve(0);
    upload.mockRejectedValueOnce(
      new ApiError(503, { type: 'urn:bseat:problem:photo:busy', status: 503 }, 3),
    );
    const user = userEvent.setup();
    const { container } = renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    await screen.findByText('0 of 10 photos');
    await user.upload(container.querySelector<HTMLInputElement>('input[type=file]')!, png('a.png'));
    expect(await screen.findByText(/Failed: We're busy right now/)).toBeInTheDocument();
    upload.mockResolvedValueOnce(photo(1));
    await user.click(screen.getByRole('button', { name: /Retry/ }));
    expect(await screen.findByText('Added')).toBeInTheDocument();
  });

  it('rejects a wrong type before any request and offers only Dismiss', async () => {
    serve(0);
    const user = userEvent.setup({ applyAccept: false });
    const { container } = renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    await screen.findByText('0 of 10 photos');
    await user.upload(
      container.querySelector<HTMLInputElement>('input[type=file]')!,
      new File(['x'], 'doc.pdf', { type: 'application/pdf' }),
    );
    expect(
      (await screen.findAllByText(/iPhone HEIC photos need converting/)).length,
    ).toBeGreaterThan(0);
    expect(upload).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Dismiss/ }));
    expect(screen.queryByRole('list', { name: 'Uploads' })).not.toBeInTheDocument();
  });

  it('cancels a waiting file by aborting nothing and marking it cancelled', async () => {
    serve(0);
    upload.mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();
    const { container } = renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    await screen.findByText('0 of 10 photos');
    await user.upload(container.querySelector<HTMLInputElement>('input[type=file]')!, [
      png('a.png'),
      png('b.png'),
      png('c.png'),
    ]);
    expect(await screen.findByText('Waiting')).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Cancel c.png' }));
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });

  it('shows the session-ended alert on a 401', async () => {
    serve(0);
    upload.mockRejectedValueOnce(
      new ApiError(401, { type: 'urn:bseat:problem:unauthorized', status: 401 }),
    );
    const user = userEvent.setup();
    const { container } = renderWithQuery(<SpacePhotoManager spaceId="s1" />);
    await screen.findByText('0 of 10 photos');
    await user.upload(container.querySelector<HTMLInputElement>('input[type=file]')!, png('a.png'));
    expect(await screen.findByText('Your session has ended')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in?next=%2Fowner%2Fspaces%2Fs1%2Fphotos',
    );
  });

  it('asks before an in-app link leaves with unfinished uploads, and stays or leaves', async () => {
    serve(0);
    upload.mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();
    const { container } = renderWithQuery(
      <>
        <Link href="/owner/spaces/s1/seats">Seats</Link>
        <SpacePhotoManager spaceId="s1" />
      </>,
    );
    await screen.findByText('0 of 10 photos');
    await user.click(screen.getByRole('link', { name: 'Seats' }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText('Leave this page?')).not.toBeInTheDocument();
    await user.upload(container.querySelector<HTMLInputElement>('input[type=file]')!, [
      png('a.png'),
      png('b.png'),
    ]);
    await user.click(screen.getByRole('link', { name: 'Seats' }));
    expect(await screen.findByText(/2 photos haven't finished uploading/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stay on this page' }));
    expect(push).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Seats' })).toHaveFocus();
    });
    await user.click(screen.getByRole('link', { name: 'Seats' }));
    await user.click(await screen.findByRole('button', { name: 'Leave and cancel' }));
    expect(push).toHaveBeenCalledWith('/owner/spaces/s1/seats');
  });
});
