import { ApiError } from '@bseat/api-client';

import { describeOwnerProblem, type OwnerAction } from './marketplace-problems';
import type { ProblemCopy } from './problem-copy';
import { SEAT_LIMIT } from './seat-values';

export type SeatAction =
  | 'add one'
  | 'add many'
  | 'edit seat'
  | 'remove seat'
  | 'add cubicle'
  | 'rename cubicle'
  | 'remove cubicle';

export interface SeatProblemContext {
  label?: string;
  name?: string;
  /** Seats the space has now, for the seat-limit sentence. */
  current?: number;
}

/** A field error (text under one input) or a page/card alert, per the ui/02 section 9 table. */
export interface SeatProblem {
  field?: string;
  alert?: ProblemCopy;
}

const FALLBACK: Record<SeatAction, OwnerAction> = {
  'add one': 'add seats',
  'add many': 'add seats',
  'edit seat': 'save this seat',
  'remove seat': 'remove this seat',
  'add cubicle': 'add this cubicle',
  'rename cubicle': 'rename this cubicle',
  'remove cubicle': 'remove this cubicle',
};

const PREFIX = 'urn:bseat:problem:listing:';
const alert = (title: string, text: string): SeatProblem => ({
  alert: { title, description: [text] },
});

export function describeSeatProblem(
  error: unknown,
  action: SeatAction,
  ctx: SeatProblemContext,
): SeatProblem {
  if (error instanceof ApiError) {
    const type = error.problem?.type.startsWith(PREFIX)
      ? error.problem.type.slice(PREFIX.length)
      : undefined;
    if (type === 'label-taken') {
      if (action === 'add many') {
        const labels = error.problem?.labels ?? [];
        const rest = labels.length - 5;
        const list = labels.slice(0, 5).join(', ') + (rest > 0 ? ` and ${rest} more` : '');
        return alert(
          'Some labels are already used',
          `${list} already exist in this space. No seats were added. Change the prefix or the numbers and try again.`,
        );
      }
      return {
        field: `${ctx.label ?? 'That label'} is already used by another seat. Choose a different label.`,
      };
    }
    if (type === 'seat-limit') {
      const current = ctx.current ?? 0;
      return alert(
        'Seat limit reached',
        `A space can have up to ${SEAT_LIMIT} seats. This one has ${current}, so you can add ${Math.max(0, SEAT_LIMIT - current)} more. No seats were added.`,
      );
    }
    if (type === 'cubicle-name-taken') {
      return { field: 'Another cubicle already has that name. Choose a different one.' };
    }
    if (type === 'seat-has-future-bookings') {
      return action === 'remove cubicle'
        ? alert(
            'A seat in this cubicle has upcoming bookings',
            `${ctx.name ?? 'This cubicle'} can't be removed until those bookings end or are cancelled by the renter. Nothing was removed.`,
          )
        : alert(
            'Seat has upcoming bookings',
            `${ctx.label ?? 'This seat'} can't be removed until its bookings end or are cancelled by the renter.`,
          );
    }
    if (error.status === 404) {
      const seat = action === 'edit seat' || action === 'remove seat';
      return alert(
        seat ? 'Seat not found' : 'Cubicle not found',
        'It may have been removed. The list is up to date.',
      );
    }
  }
  return { alert: describeOwnerProblem(error, FALLBACK[action]) };
}
