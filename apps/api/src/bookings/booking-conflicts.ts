import { HttpStatus, type HttpException, NotFoundException } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import pg from 'pg';

import { ProblemException } from '../common/errors/problem.exception.js';

/**
 * Booking conflicts with existing state (409) and how database errors from the booking
 * INSERT map to them (ADR-0009 section 2, which moved the exclusions from `booking` to `seat_hold`). Registry: specs/001-seat-booking/contracts/README.md.
 */

export const BOOKING_PROBLEM_TYPE = {
  'seat-unavailable': 'urn:bseat:problem:booking:seat-unavailable',
  'user-overlap': 'urn:bseat:problem:booking:user-overlap',
  'already-started': 'urn:bseat:problem:booking:already-started',
} as const;

export type BookingConflict = keyof typeof BOOKING_PROBLEM_TYPE;

const CONFLICT_COPY: Record<BookingConflict, { title: string; detail: string }> = {
  'seat-unavailable': {
    title: 'Seat unavailable',
    detail: 'This seat is no longer available for that time.',
  },
  'user-overlap': {
    title: 'Overlapping booking',
    detail: 'You already have a booking at that time.',
  },
  'already-started': {
    title: 'Booking already started',
    detail: 'This booking has already started and can no longer be cancelled.',
  },
};

export function bookingProblem(conflict: BookingConflict): ProblemException {
  const { title, detail } = CONFLICT_COPY[conflict];
  return new ProblemException(HttpStatus.CONFLICT, BOOKING_PROBLEM_TYPE[conflict], title, detail);
}

const EXCLUSION_VIOLATION = '23P01';
const FOREIGN_KEY_VIOLATION = '23503';
const DEADLOCK_DETECTED = '40P01';
const LOCK_NOT_AVAILABLE = '55P03';

const CONFLICT_BY_CONSTRAINT: Record<string, BookingConflict | undefined> = {
  seat_hold_seat_no_overlap: 'seat-unavailable',
  seat_hold_user_no_overlap: 'user-overlap',
};

/**
 * What to do with an error from the booking INSERT: throw the returned HTTP exception,
 * `retry` (a deadlock between conflicting inserts; nothing was committed), `lock-timeout`
 * (waited past `lock_timeout`; log and rethrow, never retry), or `rethrow`
 * (anything else, including a CHECK failure, which means the TS rules and the DB disagree).
 * SQLSTATE and constraint come from the driver error Drizzle wraps, never from the message.
 */
export function classifyInsertError(
  err: unknown,
): HttpException | 'retry' | 'lock-timeout' | 'rethrow' {
  if (!(err instanceof DrizzleQueryError) || !(err.cause instanceof pg.DatabaseError)) {
    return 'rethrow';
  }
  const { code, constraint = '' } = err.cause;
  if (code === DEADLOCK_DETECTED) return 'retry';
  if (code === LOCK_NOT_AVAILABLE) return 'lock-timeout';
  if (code === EXCLUSION_VIOLATION) {
    const conflict = CONFLICT_BY_CONSTRAINT[constraint];
    return conflict ? bookingProblem(conflict) : 'rethrow';
  }
  if (code === FOREIGN_KEY_VIOLATION && constraint === 'booking_seat_id_seat_id_fk') {
    return new NotFoundException('Seat not found');
  }
  return 'rethrow';
}
