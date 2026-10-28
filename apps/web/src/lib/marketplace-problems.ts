import { ApiError } from '@bseat/api-client';

import { safeNext } from './safe-next';
import type { ProblemCopy } from './problem-copy';

/** Screens that use this copy; the Alert title reads "We couldn't {action}" (ui/02 9.1). */
export type OwnerAction =
  | 'save your space'
  | 'publish this space'
  | 'unpublish this space'
  | 'load your spaces'
  | 'load this space'
  | 'add seats'
  | 'save this seat'
  | 'remove this seat'
  | 'add this cubicle'
  | 'rename this cubicle'
  | 'remove this cubicle'
  | 'mark those seats occupied'
  | 'mark that seat vacant'
  | 'remove that mark'
  | 'load occupancy details';

export type MissingItem = 'seat' | 'pricedPass';

/** What a `listing:publish-incomplete` problem says the space lacks; undefined for any other error. */
export function publishMissing(error: unknown): MissingItem[] | undefined {
  if (!(error instanceof ApiError) || error.status !== 422) return undefined;
  if (error.problem?.type !== 'urn:bseat:problem:listing:publish-incomplete') return undefined;
  const items = (error.problem.missing ?? []).filter(
    (m): m is MissingItem => m === 'seat' || m === 'pricedPass',
  );
  return items.length > 0 ? items : undefined;
}

/**
 * Copy for a failed owner request. The server's `title` and `detail` are never shown (OQ-H):
 * the fallback depends only on the status.
 */
export function describeOwnerProblem(
  error: unknown,
  action: OwnerAction,
  path?: string,
): ProblemCopy {
  const title = `We couldn't ${action}`;
  if (!(error instanceof ApiError)) {
    return { title, description: ['Check your connection and try again.'] };
  }
  switch (error.status) {
    case 400:
    case 422:
      return { title, description: ['Check the details and try again.'] };
    case 401: {
      const next = safeNext(path, '');
      return {
        title: 'Your session has ended',
        description: [
          { text: 'Sign in', href: `/sign-in${next ? `?next=${encodeURIComponent(next)}` : ''}` },
          ' again to continue.',
        ],
      };
    }
    case 403:
      return { title: 'Not allowed', description: ["You don't have access to this."] };
    case 404:
      return {
        title,
        description: ["We couldn't find that. It may have been removed."],
      };
    case 409:
      return {
        title,
        description: ['That changed while you were working. Reload and try again.'],
      };
    default:
      return {
        title,
        description: ['Something went wrong on our side. Try again in a moment.'],
      };
  }
}
