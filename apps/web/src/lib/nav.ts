/** Role from `GET /api/me`. An account that predates roles is a renter (FR-003). */
export type NavRole = 'renter' | 'owner';

export interface NavLink {
  label: string;
  /** Literal union so `typedRoutes` rejects a link to a page that does not exist. */
  href: '/dashboard' | '/book';
  /** Pathnames where this link is the current page (`aria-current="page"`). */
  exact: readonly string[];
  /** Path prefixes where the user is inside this area (`aria-current="true"`). */
  parents: readonly string[];
  /** Spec ui/01 2.2: the owner management area marks Dashboard, except the `new` page. */
  parentExclude?: readonly string[];
}

const DASHBOARD: NavLink = {
  label: 'Dashboard',
  href: '/dashboard',
  exact: ['/dashboard'],
  parents: ['/owner/spaces/'],
  parentExclude: ['/owner/spaces/new'],
};

// `/book` until T039 switches this to `/find` (and T042 retires `/book`).
const FIND: NavLink = {
  label: 'Find a space',
  href: '/book',
  exact: ['/book'],
  parents: ['/spaces/'],
};

// "List a space" (T022) and "My bookings" (T057) are added when their pages ship.
const LINKS: Record<NavRole, readonly NavLink[]> = {
  renter: [DASHBOARD, FIND],
  owner: [DASHBOARD, FIND],
};

export function navLinksFor(role: NavRole): readonly NavLink[] {
  return LINKS[role];
}

/**
 * Static `(app)` pages that are not nav links, mapped to the nav page they are reached from.
 * The route-manifest test fails for a page that is neither here nor in the nav.
 */
export const REACHED_FROM: Record<string, string> = {};

export function navActive(link: NavLink, pathname: string): 'page' | 'true' | undefined {
  if (link.exact.includes(pathname)) return 'page';
  const excluded = link.parentExclude?.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!excluded && link.parents.some((p) => pathname.startsWith(p))) return 'true';
  return undefined;
}
