import { ApiError } from '@bseat/api-client';
import type { Route } from 'next';

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
  | 'load occupancy details'
  | 'save the calendar'
  | "switch that seat's calendar"
  | 'load availability'
  | 'save that description'
  | 'move that photo'
  | 'delete that photo';

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
          {
            text: 'Sign in',
            href: `/sign-in${next ? `?next=${encodeURIComponent(next)}` : ''}` as Route,
          },
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

/** The slot of the chosen start date began earlier today; shared by the date picker note and the book error. */
export const SLOT_STARTED: ProblemCopy = {
  title: 'That slot has already started',
  description: ['Choose a later start date.'],
};

export interface BookProblem {
  copy: ProblemCopy;
  /** What the page should reload so the renter sees current data. */
  refetch: 'seats' | 'listing' | 'none';
  clearSeat: boolean;
  clearPass: boolean;
}

const BOOK_TITLE = "We couldn't book that seat";

/** Copy and follow-up for a failed booking request (ui/03 section 8); server text is never shown. */
export function describeBookProblem(
  error: unknown,
  ctx: { spaceId: string; seatLabel?: string; path?: string },
): BookProblem {
  const out = (
    title: string,
    description: ProblemCopy['description'],
    refetch: BookProblem['refetch'] = 'none',
    clearSeat = false,
    clearPass = false,
  ): BookProblem => ({ copy: { title, description }, refetch, clearSeat, clearPass });
  const type = error instanceof ApiError ? (error.problem?.type ?? '') : '';
  const is = (suffix: string) => type === `urn:bseat:problem:${suffix}`;

  if (is('booking:seat-unavailable')) {
    return out(
      'Seat no longer available',
      [
        `${ctx.seatLabel ?? 'That seat'} was taken for part of that period while you were deciding. Choose another seat or start date.`,
      ],
      'seats',
      true,
    );
  }
  if (is('booking:user-overlap')) {
    return out(
      'You already have a booking then',
      [
        'One of your bookings overlaps this period. Choose another start date or cancel the other booking. ',
        { text: 'My bookings', href: '/bookings' },
      ],
      'seats',
      true,
    );
  }
  if (is('booking-rule:space-not-published')) {
    return out(
      'This space is no longer listed',
      [
        "You can't book it now. Bookings you already have stay valid. ",
        { text: 'Find a space', href: '/find' },
      ],
      'listing',
    );
  }
  if (is('booking-rule:own-space')) {
    return out('This is your space', [
      "You can't book a seat in your own space. Mark it occupied instead. ",
      { text: 'Manage seats', href: `/owner/spaces/${ctx.spaceId}/seats` as Route },
    ]);
  }
  if (is('booking-rule:pass-not-offered')) {
    return out(
      "That pass isn't offered",
      ["The owner doesn't offer this pass for that slot. Choose another pass or slot."],
      'listing',
      false,
      true,
    );
  }
  if (is('booking-rule:start-day-closed')) {
    return out(
      'That seat is closed on your start date',
      ['Choose another start date or another seat.'],
      'seats',
    );
  }
  if (is('booking-rule:slot-started')) {
    return out(SLOT_STARTED.title, SLOT_STARTED.description);
  }
  if (is('booking-rule:too-far-ahead')) {
    return out("That's too far ahead", [
      'You can book up to 30 days ahead. Choose an earlier start date.',
    ]);
  }
  if (error instanceof ApiError && error.status === 404) {
    return out(
      "That seat isn't available",
      ['It may have been removed. The seat list is up to date.'],
      'seats',
      true,
    );
  }
  // The status fallbacks live in describeOwnerProblem; only its generic title is the booking one.
  const fallback = describeOwnerProblem(error, 'save your space', ctx.path);
  return out(
    fallback.title.startsWith("We couldn't") ? BOOK_TITLE : fallback.title,
    fallback.description,
  );
}
