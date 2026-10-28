import { ApiError } from '@bseat/api-client';

export interface LayoutProblem {
  title: string;
  description: string;
  /** Offer "Reload layout". */
  reload?: boolean;
  /** Re-run the client check to list the offending items. */
  revalidate?: boolean;
}

const PREFIX = 'urn:bseat:problem:layout:';
const FALLBACK_TITLE = "We couldn't save the layout";

/** Copy for a failed layout save (ui/05 6.4). */
export function describeLayoutProblem(error: unknown): LayoutProblem {
  if (!(error instanceof ApiError)) {
    return { title: FALLBACK_TITLE, description: 'Check your connection and try again.' };
  }
  const type = error.problem?.type.startsWith(PREFIX)
    ? error.problem.type.slice(PREFIX.length)
    : '';
  if (type === 'stale-version' || error.status === 409) {
    return {
      title: 'This layout changed',
      description:
        'It was saved from somewhere else after you opened it. Reload the layout to continue. Your unsaved positions will be lost.',
      reload: true,
    };
  }
  if (type === 'out-of-bounds' || error.status === 422) {
    return {
      title: 'Items are outside the grid',
      description: 'Keep every item inside the grid, and every seat inside its cubicle.',
      revalidate: true,
    };
  }
  switch (error.status) {
    case 404:
      return {
        title: "We couldn't find a seat or cubicle",
        description: 'One may have been removed. Reload the layout to continue.',
        reload: true,
      };
    case 400:
      return { title: FALLBACK_TITLE, description: 'Check the details and try again.' };
    case 401:
      return { title: FALLBACK_TITLE, description: 'Sign in again to continue.' };
    case 403:
      return { title: FALLBACK_TITLE, description: "You don't have access to this." };
    default:
      return {
        title: FALLBACK_TITLE,
        description: 'Something went wrong on our side. Try again in a moment.',
      };
  }
}
