import type { ListingPhoto } from '@bseat/api-client';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { ListingGallery } from './listing-gallery';

beforeAll(() => {
  // jsdom has no PointerEvent: the swipe test needs clientX/clientY.
  class TestPointerEvent extends MouseEvent {}
  Object.defineProperty(window, 'PointerEvent', { value: TestPointerEvent, configurable: true });
  Element.prototype.scrollIntoView = vi.fn();
});

const photos = (n: number): ListingPhoto[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    position: i + 1,
    description: i === 1 ? 'The quiet corner' : null,
    altText: `Photo alt ${i + 1}`,
    card: { url: `https://s3.test/card${i + 1}.webp?s=1`, width: 640, height: 480 },
    display: { url: `https://s3.test/display${i + 1}.webp?s=1`, width: 1600, height: 1200 },
  }));

const setup = (n = 7, onRefresh = vi.fn(() => Promise.resolve())) => {
  render(<ListingGallery spaceName="Hub One" photos={photos(n)} onRefresh={onRefresh} />);
  return { onRefresh };
};

const tile = (n: number) =>
  screen.getByRole('button', { name: new RegExp(`^Photo alt ${n}, photo ${n} of`) });

describe('ListingGallery', () => {
  it('shows the count, captions for described photos only, and tile names', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Photos' })).toBeInTheDocument();
    expect(screen.getByText('7 photos')).toBeInTheDocument();
    expect(screen.getAllByRole('figure')).toHaveLength(7);
    expect(screen.getAllByText('The quiet corner')).toHaveLength(1);
    expect(tile(3)).toHaveAccessibleName('Photo alt 3, photo 3 of 7, open large view');
    expect(tile(3)).toHaveAttribute('aria-haspopup', 'dialog');
  });

  it('cover uses display, other tiles use card', () => {
    setup();
    expect(within(tile(1)).getByRole('img')).toHaveAttribute(
      'src',
      'https://s3.test/display1.webp?s=1',
    );
    expect(within(tile(2)).getByRole('img')).toHaveAttribute(
      'src',
      'https://s3.test/card2.webp?s=1',
    );
  });

  it('singular count', () => {
    setup(1);
    expect(screen.getByText('1 photo')).toBeInTheDocument();
  });

  it('no photos: placeholder, no buttons', () => {
    setup(0);
    expect(screen.getByText('No photos yet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('opens the third photo uncropped with "3 of 7" and focuses Close', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(tile(3));
    const dialog = screen.getByRole('dialog', { name: 'Hub One photos' });
    expect(within(dialog).getByText('3 of 7')).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: 'Photo alt 3' })).toHaveAttribute(
      'src',
      'https://s3.test/display3.webp?s=1',
    );
    expect(within(dialog).getByRole('status')).toHaveTextContent('Photo 3 of 7: Photo alt 3');
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('arrows, buttons, Home and End move and wrap', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(tile(1));
    const dialog = screen.getByRole('dialog');
    await user.keyboard('{ArrowLeft}');
    expect(within(dialog).getByText('7 of 7')).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('1 of 7')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Next photo' }));
    expect(within(dialog).getByText('2 of 7')).toBeInTheDocument();
    expect(within(dialog).getByText('The quiet corner')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Previous photo' }));
    expect(within(dialog).getByText('1 of 7')).toBeInTheDocument();
    await user.keyboard('{End}');
    expect(within(dialog).getByText('7 of 7')).toBeInTheDocument();
    await user.keyboard('{Home}');
    expect(within(dialog).getByText('1 of 7')).toBeInTheDocument();
  });

  it('traps focus: Tab cycles Close, Previous, Next', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(tile(2));
    const dialog = screen.getByRole('dialog');
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Previous photo' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Next photo' })).toHaveFocus();
    await user.tab();
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();
  });

  it('swipe left is next, swipe right is previous, a short or vertical move does nothing', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(tile(3));
    const dialog = screen.getByRole('dialog');
    const stage = within(dialog).getByTestId('photo-stage');
    const swipe = (dx: number, dy = 0) => {
      fireEvent.pointerDown(stage, { clientX: 200, clientY: 100 });
      fireEvent.pointerUp(stage, { clientX: 200 + dx, clientY: 100 + dy });
    };
    swipe(-80);
    expect(within(dialog).getByText('4 of 7')).toBeInTheDocument();
    swipe(80);
    expect(within(dialog).getByText('3 of 7')).toBeInTheDocument();
    swipe(-30);
    swipe(-80, 70);
    expect(within(dialog).getByText('3 of 7')).toBeInTheDocument();
  });

  it('Escape returns focus to the tile that opened it', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(tile(3));
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(tile(3)).toHaveFocus();
  });

  it('Close returns focus to the tile of the photo showing at that moment', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(tile(3));
    await user.keyboard('{ArrowRight}{ArrowRight}');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(tile(5)).toHaveFocus();
  });

  it('one photo: no Previous or Next and arrows do nothing', async () => {
    const user = userEvent.setup();
    setup(1);
    await user.click(tile(1));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('1 of 1')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Next photo' })).toBeNull();
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('1 of 1')).toBeInTheDocument();
  });

  it('large view error: one refresh, then message and Try again', async () => {
    const user = userEvent.setup();
    const { onRefresh } = setup();
    await user.click(tile(3));
    const dialog = screen.getByRole('dialog');
    fireEvent.error(within(dialog).getByRole('img', { name: 'Photo alt 3' }));
    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalledTimes(1);
    });
    fireEvent.error(within(dialog).getByRole('img', { name: 'Photo alt 3' }));
    expect(await within(dialog).findByText("We couldn't load this photo.")).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(within(dialog).getByRole('img', { name: 'Photo alt 3' })).toBeInTheDocument();
    await user.keyboard('{ArrowRight}');
    expect(within(dialog).getByText('4 of 7')).toBeInTheDocument();
  });

  it('keeps the open photo by id when the list changes', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn(() => Promise.resolve());
    const { rerender } = render(
      <ListingGallery spaceName="Hub One" photos={photos(7)} onRefresh={onRefresh} />,
    );
    await user.click(tile(5));
    rerender(
      <ListingGallery
        spaceName="Hub One"
        photos={photos(7).filter((p) => p.id !== 'p2')}
        onRefresh={onRefresh}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('4 of 6')).toBeInTheDocument();
    rerender(
      <ListingGallery
        spaceName="Hub One"
        photos={photos(7).filter((p) => p.id !== 'p2' && p.id !== 'p5')}
        onRefresh={onRefresh}
      />,
    );
    expect(within(dialog).getByText('4 of 5')).toBeInTheDocument();
    expect(within(dialog).getByRole('status')).toHaveTextContent('Photo 4 of 5: Photo alt 6');
  });
});
