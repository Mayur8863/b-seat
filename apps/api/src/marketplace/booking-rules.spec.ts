import { describe, expect, it } from 'vitest';

import { PROBLEM_TYPES } from '../common/errors/problem-types.js';
import { evaluatePassBookingRules, type PassBookingFacts } from './booking-rules.js';

const now = new Date('2026-11-01T10:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const ok: PassBookingFacts = {
  space: { status: 'published' },
  isOwner: false,
  offered: true,
  startDayOpen: true,
  firstStartsAt: new Date(now.getTime() + DAY_MS),
};

describe('evaluatePassBookingRules', () => {
  it('passes when every rule holds', () => {
    expect(evaluatePassBookingRules(ok, now)).toBeNull();
  });

  it.each([
    ['space-not-published', { space: { status: 'unpublished' as const } }, 'spaceNotPublished'],
    ['own-space', { isOwner: true }, 'ownSpace'],
    ['pass-not-offered', { offered: false }, 'passNotOffered'],
    ['start-day-closed', { startDayOpen: false }, 'startDayClosed'],
    ['slot-started', { firstStartsAt: now }, 'slotStarted'],
    ['slot-started', { firstStartsAt: new Date(now.getTime() - 1) }, 'slotStarted'],
    [
      'too-far-ahead',
      { firstStartsAt: new Date(now.getTime() + 30 * DAY_MS + 60_000) },
      'tooFarAhead',
    ],
  ] as const)('returns %s when only that rule is broken', (rule, patch, key) => {
    const violation = evaluatePassBookingRules({ ...ok, ...patch }, now);
    expect(violation).toMatchObject({ rule, type: PROBLEM_TYPES[key], status: 422 });
    expect(violation?.title).toBeTruthy();
    expect(violation?.detail).toBeTruthy();
  });

  it('accepts a first start exactly 30 x 24 h ahead', () => {
    const firstStartsAt = new Date(now.getTime() + 30 * DAY_MS);
    expect(evaluatePassBookingRules({ ...ok, firstStartsAt }, now)).toBeNull();
  });

  it('accepts a first start one millisecond after now', () => {
    const firstStartsAt = new Date(now.getTime() + 1);
    expect(evaluatePassBookingRules({ ...ok, firstStartsAt }, now)).toBeNull();
  });

  it('returns only the first violation in the documented order', () => {
    const allBroken: PassBookingFacts = {
      space: { status: 'unpublished' },
      isOwner: true,
      offered: false,
      startDayOpen: false,
      firstStartsAt: new Date(now.getTime() - DAY_MS),
    };
    const order: string[] = [];
    let facts = allBroken;
    const fixes: Partial<PassBookingFacts>[] = [
      { space: { status: 'published' } },
      { isOwner: false },
      { offered: true },
      { startDayOpen: true },
      { firstStartsAt: new Date(now.getTime() + 31 * DAY_MS) },
    ];
    for (const fix of fixes) {
      const violation = evaluatePassBookingRules(facts, now);
      if (violation) order.push(violation.rule);
      facts = { ...facts, ...fix };
    }
    order.push(evaluatePassBookingRules(facts, now)?.rule ?? 'none');
    expect(order).toEqual([
      'space-not-published',
      'own-space',
      'pass-not-offered',
      'start-day-closed',
      'slot-started',
      'too-far-ahead',
    ]);
  });
});
