import { NotFoundException } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import pg from 'pg';
import { describe, expect, it } from 'vitest';

import { ProblemException } from '../common/errors/problem.exception.js';
import { BOOKING_PROBLEM_TYPE, bookingProblem, classifyInsertError } from './booking-conflicts.js';

/** A Drizzle-wrapped driver error, as `db.insert(...)` rejects with it. */
function driverError(code: string, constraint?: string): DrizzleQueryError {
  const cause = new pg.DatabaseError('simulated', 0, 'error');
  cause.code = code;
  cause.constraint = constraint;
  return new DrizzleQueryError('insert into "booking" ...', [], cause);
}

describe('classifyInsertError (ADR-0008 section 2)', () => {
  it('maps 23P01 on seat_hold_seat_no_overlap to 409 seat-unavailable', () => {
    const outcome = classifyInsertError(driverError('23P01', 'seat_hold_seat_no_overlap'));
    expect(outcome).toBeInstanceOf(ProblemException);
    const problem = outcome as ProblemException;
    expect(problem.getStatus()).toBe(409);
    expect(problem.type).toBe('urn:bseat:problem:booking:seat-unavailable');
    expect(problem.title).toBe('Seat unavailable');
    expect(problem.detail).toBe('This seat is no longer available for that time.');
  });

  it('maps 23P01 on seat_hold_user_no_overlap to 409 user-overlap', () => {
    const problem = classifyInsertError(driverError('23P01', 'seat_hold_user_no_overlap'));
    expect(problem).toMatchObject({
      type: 'urn:bseat:problem:booking:user-overlap',
      title: 'Overlapping booking',
      detail: 'You already have a booking at that time.',
    });
    expect((problem as ProblemException).getStatus()).toBe(409);
  });

  it('flags a lock timeout (55P03) so it is logged and not retried', () => {
    expect(classifyInsertError(driverError('55P03'))).toBe('lock-timeout');
  });

  it('asks for a retry on a deadlock (40P01)', () => {
    expect(classifyInsertError(driverError('40P01'))).toBe('retry');
  });

  it('maps 23503 on the seat foreign key to 404 Seat not found', () => {
    const outcome = classifyInsertError(driverError('23503', 'booking_seat_id_seat_id_fk'));
    expect(outcome).toBeInstanceOf(NotFoundException);
    expect((outcome as NotFoundException).message).toBe('Seat not found');
  });

  it.each([
    ['a CHECK violation (TS rules and DB disagree)', driverError('23514', 'booking_quarter_hour')],
    ['23P01 on an unknown constraint', driverError('23P01', 'something_else')],
    ['23503 on the user foreign key', driverError('23503', 'booking_user_id_user_id_fk')],
    ['an unrelated SQLSTATE', driverError('57014')],
    ['a plain Error', new Error('boom')],
    ['a DrizzleQueryError without a driver cause', new DrizzleQueryError('q', [])],
    ['a non-error value', 'nope'],
  ])('leaves %s to be rethrown', (_, err) => {
    expect(classifyInsertError(err)).toBe('rethrow');
  });
});

describe('bookingProblem', () => {
  it('builds 409 already-started', () => {
    const problem = bookingProblem('already-started');
    expect(problem.getStatus()).toBe(409);
    expect(problem.type).toBe(BOOKING_PROBLEM_TYPE['already-started']);
    expect(problem.type).toBe('urn:bseat:problem:booking:already-started');
    expect(problem.title).toBe('Booking already started');
    expect(problem.detail).toBe('This booking has already started and can no longer be cancelled.');
  });
});
