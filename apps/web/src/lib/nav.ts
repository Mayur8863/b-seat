/** Role from `GET /api/me`. An account that predates roles is a renter (FR-003). */
export type NavRole = 'renter' | 'owner';

export interface NavLink {
  label: string;
  /** Literal union so `typedRoutes` rejects a link to a page that does not exist. */
  href: '/dashboard' | '/find' | '/owner/spaces/new';
  /** Pathnames where this link is the current page (`aria-current="page"`). */
  exact: readonly string[];
  /** Path prefixes where the user is inside this area (`aria-current="true"`). */
  parents: readonly string[];
  /** Spec ui/01 2.2: the owner management area marks Dashboard, except the `new` page. */
  parentExclude?: readonly string[];
}

export const DASHBOARD: NavLink = {
  label: 'Dashboard',
  href: '/dashboard',
  exact: ['/dashboard'],
  parents: ['/owner/spaces/'],
  parentExclude: ['/owner/spaces/new'],
};

const FIND: NavLink = {
  label: 'Find a space',
  href: '/find',
  exact: ['/find'],
  parents: ['/spaces/'],
};

const LIST_SPACE: NavLink = {
  label: 'List a space',
  href: '/owner/spaces/new',
  exact: ['/owner/spaces/new'],
  parents: [],
};

// "My bookings" (T057) is added when its page ships.
const LINKS: Record<NavRole, readonly NavLink[]> = {
  renter: [DASHBOARD, FIND],
  owner: [DASHBOARD, LIST_SPACE, FIND],
};

export function navLinksFor(role: NavRole): readonly NavLink[] {
  return LINKS[role];
}

export type PageAudience = NavRole | 'both';

/** Who may use each `(app)` page. Every page, static or dynamic, must be listed (FR-004). */
export const PAGE_ROLES: Record<string, PageAudience> = {
  '/dashboard': 'both',
  '/find': 'both',
  '/spaces/[spaceId]': 'both',
  '/owner/spaces/new': 'owner',
  '/owner/spaces/[spaceId]': 'owner',
  '/owner/spaces/[spaceId]/seats': 'owner',
  '/owner/spaces/[spaceId]/pricing': 'owner',
  '/owner/spaces/[spaceId]/layout': 'owner',
  '/owner/spaces/[spaceId]/availability': 'owner',
};

/**
 * `(app)` pages that are not nav links, mapped to the nav page they are reached from.
 * Dynamic routes keep their `[param]` segment. The route-manifest test fails for a page
 * that is neither in a role's nav nor here with a target in that role's nav.
 */
export const REACHED_FROM: Record<string, NavLink['href']> = {
  '/owner/spaces/[spaceId]': '/dashboard',
  '/owner/spaces/[spaceId]/seats': '/dashboard',
  '/owner/spaces/[spaceId]/pricing': '/dashboard',
  '/owner/spaces/[spaceId]/layout': '/dashboard',
  '/owner/spaces/[spaceId]/availability': '/dashboard',
  '/spaces/[spaceId]': '/find',
};

export function navActive(link: NavLink, pathname: string): 'page' | 'true' | undefined {
  if (link.exact.includes(pathname)) return 'page';
  const excluded = link.parentExclude?.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!excluded && link.parents.some((p) => pathname.startsWith(p))) return 'true';
  return undefined;
}
