import { describe, expect, it } from 'vitest';

import { ProblemException } from '../common/errors/problem.exception.js';
import { AvailabilityQueryInputSchema } from './spaces.schemas.js';
import { resolveWindow } from './spaces.service.js';

const INVALID_LOCAL_TIME = 'urn:bseat:problem:booking-rule:invalid-local-time';

function problemOf(fn: () => unknown): ProblemException {
  try {
    fn();
  } catch (err) {
    if (err instanceof ProblemException) return err;
    throw err;
  }
  throw new Error('expected a ProblemException');
}

describe('resolveWindow', () => {
  it('converts a London window to UTC instants (BST)', () => {
    expect(
      resolveWindow({ date: '2026-10-23', startTime: '10:00', endTime: '11:00' }, 'Europe/London'),
    ).toEqual({
      startsAt: new Date('2026-10-23T09:00:00.000Z'),
      endsAt: new Date('2026-10-23T10:00:00.000Z'),
    });
  });

  it('converts a Kolkata window to UTC instants (+05:30)', () => {
    expect(
      resolveWindow({ date: '2026-10-23', startTime: '09:30', endTime: '10:30' }, 'Asia/Kolkata'),
    ).toEqual({
      startsAt: new Date('2026-10-23T04:00:00.000Z'),
      endsAt: new Date('2026-10-23T05:00:00.000Z'),
    });
  });

  it('allows windows that break booking rules (past, off-quarter, night)', () => {
    expect(
      resolveWindow({ date: '2020-01-01', startTime: '02:10', endTime: '02:20' }, 'Europe/London'),
    ).toEqual({
      startsAt: new Date('2020-01-01T02:10:00.000Z'),
      endsAt: new Date('2020-01-01T02:20:00.000Z'),
    });
  });

  it.each([
    ['end in the DST gap', '2026-03-29', '00:30', '01:30'],
    ['start in the DST gap', '2026-03-29', '01:30', '03:00'],
    ['start in the DST overlap', '2026-10-25', '01:30', '02:30'],
    ['end in the DST overlap', '2026-10-25', '00:30', '01:15'],
  ])('throws 422 invalid-local-time for the %s', (_, date, startTime, endTime) => {
    const problem = problemOf(() => resolveWindow({ date, startTime, endTime }, 'Europe/London'));
    expect(problem.getStatus()).toBe(422);
    expect(problem.type).toBe(INVALID_LOCAL_TIME);
    expect(problem.title).toBe('Invalid booking window');
    expect(problem.detail).toMatch(/daylight-saving/);
  });
});

describe('AvailabilityQueryInputSchema', () => {
  const parse = (q: Record<string, string>) => AvailabilityQueryInputSchema.safeParse(q);

  it('accepts a well-formed window', () => {
    expect(parse({ date: '2026-10-23', startTime: '10:00', endTime: '11:00' }).success).toBe(true);
  });

  it.each([
    ['endTime equal to startTime', { date: '2026-10-23', startTime: '10:00', endTime: '10:00' }],
    ['endTime before startTime', { date: '2026-10-23', startTime: '11:00', endTime: '10:00' }],
    ['an impossible date', { date: '2026-02-30', startTime: '10:00', endTime: '11:00' }],
    ['a malformed time', { date: '2026-10-23', startTime: '9:00', endTime: '11:00' }],
    ['24:00', { date: '2026-10-23', startTime: '10:00', endTime: '24:00' }],
    ['a missing field', { date: '2026-10-23', startTime: '10:00' }],
  ])('rejects %s', (_, query) => {
    expect(parse(query).success).toBe(false);
  });

  it('reports end <= start on the endTime field', () => {
    const result = parse({ date: '2026-10-23', startTime: '10:00', endTime: '09:00' });
    expect(result.error?.issues.map((i) => i.path)).toEqual([['endTime']]);
  });
});
