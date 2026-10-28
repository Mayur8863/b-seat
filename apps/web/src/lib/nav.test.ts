import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  navActive,
  navLinksFor,
  PAGE_ROLES,
  REACHED_FROM,
  type NavRole,
  type PageAudience,
} from './nav';

const APP_DIR = join(__dirname, '..', 'app', '(app)');
const ROLES: readonly NavRole[] = ['renter', 'owner'];

/** Next route for a `page.tsx` folder: drops `(group)` and `@slot` segments, skips `_private`. */
export function routeOf(segments: readonly string[]): string | null {
  if (segments.some((s) => s.startsWith('_'))) return null;
  const parts = segments.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'));
  return '/' + parts.join('/');
}

function pageRoutes(dir: string, segments: string[] = []): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return pageRoutes(join(dir, entry.name), [...segments, entry.name]);
    if (entry.name !== 'page.tsx') return [];
    const route = routeOf(segments);
    return route === null ? [] : [route];
  });
}

interface Manifest {
  pageRoles: Record<string, PageAudience>;
  reachedFrom: Record<string, string>;
}

/** Problems for one role: pages it can use that are not in its nav or reached from it. */
export function manifestProblems(role: NavRole, routes: readonly string[], m: Manifest): string[] {
  const navHrefs = new Set<string>(navLinksFor(role).map((l) => l.href));
  return routes.flatMap((route) => {
    if (!Object.hasOwn(m.pageRoles, route)) return [`${route}: no audience in PAGE_ROLES`];
    const audience = m.pageRoles[route];
    if (audience !== 'both' && audience !== role) return [];
    if (navHrefs.has(route)) return [];
    if (!Object.hasOwn(m.reachedFrom, route)) return [`${route}: not in the ${role} nav`];
    const from = m.reachedFrom[route] ?? '';
    return navHrefs.has(from) ? [] : [`${route}: reached from ${from}, not in the ${role} nav`];
  });
}

describe('route manifest (FR-004)', () => {
  const routes = pageRoutes(APP_DIR);

  it('finds the existing pages', () => {
    expect(routes).toEqual(expect.arrayContaining(['/dashboard', '/book']));
  });

  it.each(ROLES)('every (app) page a %s can use is in their nav or reached from it', (role) => {
    expect(
      manifestProblems(role, routes, { pageRoles: PAGE_ROLES, reachedFrom: REACHED_FROM }),
    ).toEqual([]);
  });

  it('has no manifest entry for a page that does not exist', () => {
    for (const key of [...Object.keys(PAGE_ROLES), ...Object.keys(REACHED_FROM)]) {
      expect(routes).toContain(key);
    }
  });

  it('catches orphan pages, including dynamic ones, and checks each role on its own pages', () => {
    const synthetic = ['/dashboard', '/orphan', '/spaces/[id]', '/owner/only', '/owner/only/[id]'];
    const m: Manifest = {
      pageRoles: {
        '/dashboard': 'both',
        '/orphan': 'both',
        '/spaces/[id]': 'renter',
        '/owner/only': 'owner',
        '/owner/only/[id]': 'owner',
      },
      reachedFrom: { '/owner/only/[id]': '/not-nav' },
    };
    expect(manifestProblems('renter', synthetic, m)).toEqual([
      '/orphan: not in the renter nav',
      '/spaces/[id]: not in the renter nav',
    ]);
    expect(manifestProblems('owner', synthetic, m)).toEqual([
      '/orphan: not in the owner nav',
      '/owner/only: not in the owner nav',
      '/owner/only/[id]: reached from /not-nav, not in the owner nav',
    ]);
    expect(manifestProblems('owner', ['/x'], { pageRoles: {}, reachedFrom: {} })).toEqual([
      '/x: no audience in PAGE_ROLES',
    ]);
  });
});

describe('routeOf', () => {
  it('strips route groups and slots and skips private folders', () => {
    expect(routeOf(['(shop)', 'spaces', '[id]'])).toBe('/spaces/[id]');
    expect(routeOf(['@modal', 'x'])).toBe('/x');
    expect(routeOf(['_parts', 'x'])).toBeNull();
    expect(routeOf([])).toBe('/');
  });
});

describe('navLinksFor', () => {
  it('lists Dashboard and Find a space for both roles', () => {
    for (const role of ROLES) {
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
