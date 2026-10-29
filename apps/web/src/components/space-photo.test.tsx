import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import config from '../../next.config';

import { SpacePhoto } from './space-photo';

const photo = (url = 'https://s3.test/a.webp?sig=1') => ({
  url,
  width: 640,
  height: 480,
  alt: 'Sunny desks',
});

describe('SpacePhoto', () => {
  it('renders the signed URL itself with alt, never via the optimizer', () => {
    render(<SpacePhoto photo={photo()} variant="card" />);
    const img = screen.getByRole('img', { name: 'Sunny desks' });
    expect(img).toHaveAttribute('src', 'https://s3.test/a.webp?sig=1');
    expect(img.getAttribute('src')).not.toContain('/_next/image');
    expect(img).toHaveAttribute('width', '640');
  });

  it('config: unoptimized images and no remotePatterns', () => {
    expect(config.images?.unoptimized).toBe(true);
    expect(config.images?.remotePatterns).toBeUndefined();
  });

  it('null photo: placeholder text, no image', () => {
    render(<SpacePhoto photo={null} variant="card" />);
    expect(screen.getByText('No photos yet')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('loading until load fires', async () => {
    const { container } = render(<SpacePhoto photo={photo()} variant="card" />);
    expect(container.querySelector('[data-loading="true"]')).not.toBeNull();
    fireEvent.load(screen.getByRole('img'));
    await waitFor(() => {
      expect(container.querySelector('[data-loading="true"]')).toBeNull();
    });
  });

  it('error: refreshes once, then shows Photo unavailable on a second failure', async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    render(<SpacePhoto photo={photo()} variant="card" onRefresh={onRefresh} />);
    await act(async () => {
      fireEvent.error(screen.getByRole('img'));
      await Promise.resolve();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Photo unavailable')).toBeNull();
    await act(async () => {
      fireEvent.error(screen.getByRole('img'));
      await Promise.resolve();
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Photo unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No photos yet')).toBeNull();
  });

  it('a fresh URL replaces an errored one', async () => {
    const onRefresh = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      <SpacePhoto photo={photo()} variant="card" onRefresh={onRefresh} />,
    );
    await act(async () => {
      fireEvent.error(screen.getByRole('img'));
      await Promise.resolve();
    });
    rerender(
      <SpacePhoto
        photo={photo('https://s3.test/a.webp?sig=2')}
        variant="card"
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://s3.test/a.webp?sig=2');
  });

  it('a loaded image keeps its URL when a refresh brings a new one', async () => {
    const { rerender, container } = render(<SpacePhoto photo={photo()} variant="card" />);
    fireEvent.load(screen.getByRole('img'));
    await waitFor(() => {
      expect(container.querySelector('[data-loading="true"]')).toBeNull();
    });
    rerender(<SpacePhoto photo={photo('https://s3.test/a.webp?sig=2')} variant="card" />);
    expect(screen.getByRole('img')).toHaveAttribute('src', 'https://s3.test/a.webp?sig=1');
  });
});
