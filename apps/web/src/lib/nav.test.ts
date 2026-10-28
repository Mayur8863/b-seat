import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { navActive, navLinksFor, REACHED_FROM } from './nav';

const APP_DIR = join(__dirname, '..', 'app', '(app)');

function pageRoutes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pageRoutes(full);
    if (name !== 'page.tsx') return [];
    const route = '/' + relative(APP_DIR, dir).split('\\').join('/');
    return [route === '/.' || route === '/' ? '/' : route];
  });
}

describe('route manifest (FR-004)', () => {
  const routes = pageRoutes(APP_DIR).filter((r) => !r.includes('['));

  it('finds the existing pages', () => {
    expect(routes).toEqual(expect.arrayContaining(['/dashboard', '/book']));
  });

  it.each(['renter', 'owner'] as const)(
    'every static (app) page is in the %s nav or declared reached-from',
    (role) => {
      const navRoutes = new Set(navLinksFor(role).flatMap((l) => [l.href, ...l.exact]));
      const orphans = routes.filter((r) => !navRoutes.has(r) && !(r in REACHED_FROM));
      expect(orphans).toEqual([]);
    },
  );

  it('declared reached-from entries point at a nav page', () => {
    const navRoutes = new Set(navLinksFor('owner').map((l) => l.href as string));
    for (const from of Object.values(REACHED_FROM)) expect(navRoutes).toContain(from);
  });
});

describe('navLinksFor', () => {
  it('lists Dashboard and Find a space for both roles', () => {
    for (const role of ['renter', 'owner'] as const) {
      expect(navLinksFor(role).map((l) => l.label)).toEqual(['Dashboard', 'Find a space']);
    }
  });
});

describe('navActive', () => {
  const [dashboard, find] = navLinksFor('owner');
  it('is page on an exact match', () => {
    expect(navActive(dashboard!, '/dashboard')).toBe('page');
    expect(navActive(find!, '/book')).toBe('page');
  });
  it('is true on a parent match', () => {
    expect(navActive(dashboard!, '/owner/spaces/abc/seats')).toBe('true');
    expect(navActive(find!, '/spaces/abc')).toBe('true');
  });
  it('is undefined elsewhere, and owner/spaces/new is not a Dashboard parent', () => {
    expect(navActive(dashboard!, '/owner/spaces/new')).toBeUndefined();
    expect(navActive(find!, '/dashboard')).toBeUndefined();
  });
});
