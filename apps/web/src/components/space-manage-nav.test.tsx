import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SpaceManageNav } from './space-manage-nav';

const pathname = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ usePathname: pathname }));

describe('SpaceManageNav', () => {
  it('has a labelled nav with Details, Seats, Passes and prices, Layout and Availability, current on the overview', () => {
    pathname.mockReturnValue('/owner/spaces/s1');
    render(<SpaceManageNav spaceId="s1" />);
    const nav = screen.getByRole('navigation', { name: 'Space management' });
    const links = nav.querySelectorAll('a');
    expect(links).toHaveLength(5);
    const details = screen.getByRole('link', { name: 'Details' });
    expect(details).toHaveAttribute('href', '/owner/spaces/s1');
    expect(details).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Seats' })).toHaveAttribute(
      'href',
      '/owner/spaces/s1/seats',
    );
    expect(screen.getByRole('link', { name: 'Passes and prices' })).toHaveAttribute(
      'href',
      '/owner/spaces/s1/pricing',
    );
    expect(screen.getByRole('link', { name: 'Layout' })).toHaveAttribute(
      'href',
      '/owner/spaces/s1/layout',
    );
    expect(screen.getByRole('link', { name: 'Availability' })).toHaveAttribute(
      'href',
      '/owner/spaces/s1/availability',
    );
  });

  it('is not current on another page', () => {
    pathname.mockReturnValue('/owner/spaces/s1/seats');
    render(<SpaceManageNav spaceId="s1" />);
    expect(screen.getByRole('link', { name: 'Details' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Seats' })).toHaveAttribute('aria-current', 'page');
  });
});
