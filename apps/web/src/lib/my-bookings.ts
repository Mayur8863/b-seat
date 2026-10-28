import { ApiError } from '@bseat/api-client';

import { formatLocalDate } from './booking-format';
import type { ProblemCopy } from './problem-copy';

export type BookingStatus = 'upcoming' | 'in-progress';

/** The API lists bookings that haven't ended; one that has started can no longer be cancelled (AC 7.2). */
export function bookingStatus(booking: { firstStartsAt: string }, now = new Date()): BookingStatus {
  return new Date(booking.firstStartsAt).getTime() <= now.getTime() ? 'in-progress' : 'upcoming';
}

/** "Tue 3 Nov 2026" for one day, else "Tue 3 Nov 2026 to Mon 9 Nov 2026". */
export function periodText(startDate: string, endDate: string): string {
  return startDate === endDate
    ? formatLocalDate(startDate)
    : `${formatLocalDate(startDate)} to ${formatLocalDate(endDate)}`;
}

/** Copy for a failed cancel (ui/03 section 8). */
export function cancelProblem(error: unknown): ProblemCopy {
  const type = error instanceof ApiError ? error.problem?.type : undefined;
  if (type === 'urn:bseat:problem:booking:already-started') {
    return {
      title: 'This booking has already started',
      description: ['It can no longer be cancelled.'],
    };
  }
  if (error instanceof ApiError && error.status === 404) {
    return {
      title: "We couldn't find that booking",
      description: ['It may have been removed. Your list is up to date.'],
    };
  }
  return {
    title: "We couldn't cancel that booking",
    description: ['Try again in a moment.'],
  };
}
