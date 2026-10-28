import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SpaceManageNav } from './space-manage-nav';

const pathname = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ usePathname: pathname }));

describe('SpaceManageNav', () => {
  it('has a labelled nav with Details only, current on the overview', () => {
    pathname.mockReturnValue('/owner/spaces/s1');
    render(<SpaceManageNav spaceId="s1" />);
    const nav = screen.getByRole('navigation', { name: 'Space management' });
    const links = nav.querySelectorAll('a');
    expect(links).toHaveLength(1);
    const details = screen.getByRole('link', { name: 'Details' });
    expect(details).toHaveAttribute('href', '/owner/spaces/s1');
    expect(details).toHaveAttribute('aria-current', 'page');
  });

  it('is not current on another page', () => {
    pathname.mockReturnValue('/owner/spaces/s1/seats');
    render(<SpaceManageNav spaceId="s1" />);
    expect(screen.getByRole('link', { name: 'Details' })).not.toHaveAttribute('aria-current');
  });
});
