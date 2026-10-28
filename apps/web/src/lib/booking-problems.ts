import { ApiError } from '@bseat/api-client';

import type { Route } from 'next';

import type { ProblemCopy } from './problem-copy';
import { safeNext } from './safe-next';

export type BookingAction = 'availability' | 'book' | 'cancel';

export interface ProblemContext {
  /** Selected seat label, for the "seat-unavailable" copy. */
  seat?: string;
  /** The space's IANA zone. */
  timeZone?: string;
  /** Current path, for the sign-in link. Only a same-origin relative path is used. */
  path?: string;
  /** Title for list loads ("We couldn't load seats"), used only for the generic outcomes. */
  fallbackTitle?: string;
}

const PREFIX = 'urn:bseat:problem:';

const GENERIC = "We couldn't complete that. Try again in a moment.";

/** Maps an API error to user-facing copy (ui.md section 6). */
export function describeProblem(
  error: unknown,
  action: BookingAction,
  context: ProblemContext = {},
): ProblemCopy {
  if (!(error instanceof ApiError)) {
    return {
      title: context.fallbackTitle ?? "We couldn't reach BSeat",
      description: ['Check your connection and try again.'],
    };
  }

  // The body can be HTML (gateway error) or JSON without a string `type`.
  const rawType: unknown = error.problem?.type;
  const type =
    typeof rawType === 'string' && rawType.startsWith(PREFIX)
      ? rawType.slice(PREFIX.length)
      : undefined;
  const zone = context.timeZone ?? 'the office time zone';

  if (error.status === 401) {
    const path = safeNext(context.path, '');
    const next = path ? `?next=${encodeURIComponent(path)}` : '';
    return {
      title: 'Your session has ended',
      description: [{ text: 'Sign in', href: `/sign-in${next}` as Route }, ' again to continue.'],
    };
  }

  if (error.status === 404) {
    const copy: Record<BookingAction, ProblemCopy> = {
      availability: {
        title: 'Office space not found',
        description: ['This space is no longer available. Choose another space.'],
      },
      book: {
        title: 'Seat not found',
        description: ['This seat is no longer available. Choose another seat.'],
      },
      cancel: {
        title: 'Booking not found',
        description: ['This booking no longer exists. Your list has been updated.'],
      },
    };
    return copy[action];
  }

  switch (type) {
    case 'booking:seat-unavailable':
      return {
        title: 'Seat no longer available',
        description: [
          `Someone else booked ${context.seat ?? 'this seat'} for an overlapping time. Choose another seat.`,
        ],
      };
    case 'booking:user-overlap':
      return {
        title: 'You already have a booking then',
        description: [
          "You can hold one booking at a time. Choose a time that doesn't overlap, or cancel your other booking in ",
          { text: 'My bookings', href: '/bookings' },
          '.',
        ],
      };
    case 'booking:already-started':
      return {
        title: 'This booking has already started',
        description: ['Bookings can only be cancelled before they start.'],
      };
    case 'booking-rule:end-before-start':
      return {
        title: 'End time is before start time',
        description: ['Choose an end time after the start time.'],
      };
    case 'booking-rule:not-on-quarter-hour':
      return {
        title: 'Use 15-minute steps',
        description: ['Start and end times must be on :00, :15, :30 or :45.'],
      };
    case 'booking-rule:invalid-local-time':
      return {
        title: `That time doesn't exist in ${zone}`,
        description: [
          `A daylight-saving change skips or repeats this time in ${zone}. Choose a different start or end time.`,
        ],
      };
    case 'booking-rule:too-short':
      return {
        title: 'Booking too short',
        description: ['A booking must be at least 15 minutes long.'],
      };
    case 'booking-rule:too-long':
      return {
        title: 'Booking too long',
        description: ['A booking can be at most 10 hours long. Choose a shorter time.'],
      };
    case 'booking-rule:outside-working-hours':
      return {
        title: 'Outside working hours',
        description: [`Bookings must be between 07:00 and 20:00 local time (${zone}).`],
      };
    case 'booking-rule:starts-in-past':
      return {
        title: 'That time has passed',
        description: ['Choose a start time in the future.'],
      };
    case 'booking-rule:too-far-ahead':
      return {
        title: 'Too far ahead',
        description: ['You can book up to 30 days ahead. Choose an earlier date.'],
      };
    case 'validation':
      return {
        title: 'Check the details',
        description: ["Some details weren't valid. Check the date and times and try again."],
      };
  }

  const detail: unknown = error.problem?.detail;
  if (error.status >= 400 && error.status < 500 && typeof detail === 'string' && detail) {
    return { title: context.fallbackTitle ?? 'Something went wrong', description: [detail] };
  }
  return { title: context.fallbackTitle ?? 'Something went wrong', description: [GENERIC] };
}
