import { ApiError, type OccupancyConflict } from '@bseat/api-client';

import { describeOwnerProblem, type OwnerAction } from './marketplace-problems';
import type { ProblemCopy } from './problem-copy';

export type OccupancyAction = 'mark occupied' | 'mark vacant' | 'remove mark';

export interface OccupancyProblem {
  alert: ProblemCopy;
  /** Present on a 409 conflict: nothing was created, and these seats are in the way (AC 5.3). */
  conflicts?: OccupancyConflict[];
}

const FALLBACK: Record<OccupancyAction, OwnerAction> = {
  'mark occupied': 'mark those seats occupied',
  'mark vacant': 'mark that seat vacant',
  'remove mark': 'remove that mark',
};

const PREFIX = 'urn:bseat:problem:occupancy:';
const copy = (title: string, text: string): ProblemCopy => ({ title, description: [text] });

/** Copy for a failed occupancy request (ui/04 sections 2.4 and 6). */
export function describeOccupancyProblem(
  error: unknown,
  action: OccupancyAction,
): OccupancyProblem {
  if (error instanceof ApiError) {
    const type = error.problem?.type.startsWith(PREFIX)
      ? error.problem.type.slice(PREFIX.length)
      : undefined;
    const conflicts = error.problem?.conflicts ?? [];
    if (type === 'conflicts-with-bookings') {
      return {
        conflicts,
        alert: copy(
          'Some seats are booked on those dates',
          "Renters have booked these seats on the dates below, and you can't cancel a renter's booking. Choose other dates or other seats. No seats were marked.",
        ),
      };
    }
    if (type === 'already-occupied') {
      return {
        conflicts,
        alert: copy(
          'Some seats are already occupied',
          "You've already marked these seats occupied on the dates below. Choose other dates or other seats. No seats were marked.",
        ),
      };
    }
    if (error.status === 404) {
      return {
        alert:
          action === 'mark occupied'
            ? copy(
                "We couldn't find one of those seats",
                'A seat may have been removed. The list is up to date. Select the seats again and try once more.',
              )
            : copy(
                "We couldn't find that mark",
                'It may already have ended. The list is up to date.',
              ),
      };
    }
    if (error.status === 400) {
      return { alert: copy('Check the details', 'Check the details and try again.') };
    }
  }
  return { alert: describeOwnerProblem(error, FALLBACK[action]) };
}
