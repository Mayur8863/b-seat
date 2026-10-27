import { describe, expect, it } from 'vitest';

import {
  addDays,
  isoWeekday,
  isValidTimeZone,
  toInstant,
  toInstantCompatible,
  toLocal,
} from './zoned-time.js';

const LONDON = 'Europe/London';
const KOLKATA = 'Asia/Kolkata';

function instantOf(date: string, time: string, zone: string): string {
  const result = toInstant(date, time, zone);
  if (result.kind !== 'ok') throw new Error(`expected ok, got ${result.kind}`);
  return result.instant.toISOString();
}

describe('toInstant', () => {
  it.each([
    {
      zone: LONDON,
      date: '2026-10-23',
      time: '09:00',
      utc: '2026-10-23T08:00:00.000Z',
      note: 'BST',
    },
    {
      zone: LONDON,
      date: '2026-11-02',
      time: '09:00',
      utc: '2026-11-02T09:00:00.000Z',
      note: 'GMT',
    },
    {
      zone: KOLKATA,
      date: '2026-10-23',
      time: '09:00',
      utc: '2026-10-23T03:30:00.000Z',
      note: '+05:30',
    },
    {
      zone: KOLKATA,
      date: '2026-10-23',
      time: '00:15',
      utc: '2026-10-22T18:45:00.000Z',
      note: 'previous UTC day',
    },
    {
      zone: 'UTC',
      date: '2026-10-23',
      time: '23:45',
      utc: '2026-10-23T23:45:00.000Z',
      note: 'UTC',
    },
  ])('converts $zone $date $time ($note)', ({ zone, date, time, utc }) => {
    expect(instantOf(date, time, zone)).toBe(utc);
  });

  it('converts unaffected times on both London change days', () => {
    expect(instantOf('2026-03-29', '09:00', LONDON)).toBe('2026-03-29T08:00:00.000Z');
    expect(instantOf('2026-10-25', '09:00', LONDON)).toBe('2026-10-25T09:00:00.000Z');
  });

  it('converts the times right around the London spring gap', () => {
    expect(instantOf('2026-03-29', '00:59', LONDON)).toBe('2026-03-29T00:59:00.000Z');
    expect(instantOf('2026-03-29', '02:00', LONDON)).toBe('2026-03-29T01:00:00.000Z');
  });

  it('reports a local time in the spring DST gap as nonexistent', () => {
    expect(toInstant('2026-03-29', '01:30', LONDON)).toEqual({ kind: 'nonexistent' });
    expect(toInstant('2026-03-29', '01:00', LONDON)).toEqual({ kind: 'nonexistent' });
  });

  it('reports a local time in the autumn DST overlap as ambiguous', () => {
    expect(toInstant('2026-10-25', '01:30', LONDON)).toEqual({ kind: 'ambiguous' });
    expect(toInstant('2026-10-25', '01:00', LONDON)).toEqual({ kind: 'ambiguous' });
  });

  it('converts the times right around the London autumn overlap', () => {
    expect(instantOf('2026-10-25', '00:59', LONDON)).toBe('2026-10-24T23:59:00.000Z');
    expect(instantOf('2026-10-25', '02:00', LONDON)).toBe('2026-10-25T02:00:00.000Z');
  });

  it.each([
    { date: '2026-02-30', time: '09:00' },
    { date: '2026-13-01', time: '09:00' },
    { date: '26-10-23', time: '09:00' },
    { date: '2026-10-23', time: '24:00' },
    { date: '2026-10-23', time: '9:00' },
    { date: '2026-10-23', time: '09:60' },
  ])('throws a RangeError for malformed input $date $time', ({ date, time }) => {
    expect(() => toInstant(date, time, LONDON)).toThrow(RangeError);
  });

  it('throws a RangeError for an unknown time zone', () => {
    expect(() => toInstant('2026-10-23', '09:00', 'Mars/Base')).toThrow(RangeError);
  });
});

describe('toLocal', () => {
  it.each([
    { utc: '2026-10-23T08:00:00Z', zone: LONDON, date: '2026-10-23', time: '09:00' },
    { utc: '2026-11-02T09:00:00Z', zone: LONDON, date: '2026-11-02', time: '09:00' },
    { utc: '2026-10-23T03:30:00Z', zone: KOLKATA, date: '2026-10-23', time: '09:00' },
    { utc: '2026-10-22T23:00:00Z', zone: LONDON, date: '2026-10-23', time: '00:00' },
    { utc: '2026-10-22T18:45:00Z', zone: KOLKATA, date: '2026-10-23', time: '00:15' },
    { utc: '2026-10-25T00:30:00Z', zone: LONDON, date: '2026-10-25', time: '01:30' },
    { utc: '2026-10-25T01:30:00Z', zone: LONDON, date: '2026-10-25', time: '01:30' },
  ])('shows $utc in $zone as $date $time', ({ utc, zone, date, time }) => {
    expect(toLocal(new Date(utc), zone)).toEqual({ date, time });
  });

  it('drops seconds and milliseconds', () => {
    expect(toLocal(new Date('2026-10-23T08:00:59.999Z'), LONDON)).toEqual({
      date: '2026-10-23',
      time: '09:00',
    });
  });

  it('round-trips with toInstant', () => {
    const instant = new Date('2026-07-01T16:45:00Z');
    const { date, time } = toLocal(instant, KOLKATA);
    expect(instantOf(date, time, KOLKATA)).toBe(instant.toISOString());
  });
});

describe('isValidTimeZone', () => {
  it('accepts the seeded zones and UTC (guards against a small-ICU build)', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it.each(['Mars/Base', '', 'Europe/Londres', 'not a zone'])('rejects %j', (zone) => {
    expect(isValidTimeZone(zone)).toBe(false);
  });
});

describe('toInstantCompatible', () => {
  it('resolves a London gap to the instant after the gap', () => {
    expect(toInstantCompatible('2026-03-29', '01:30', LONDON).toISOString()).toBe(
      '2026-03-29T01:30:00.000Z',
    );
  });

  it('resolves a London overlap to the earlier instant', () => {
    expect(toInstantCompatible('2026-10-25', '01:30', LONDON).toISOString()).toBe(
      '2026-10-25T00:30:00.000Z',
    );
  });

  it.each(['Europe/London', 'America/New_York'])(
    'resolves every hourly wall-clock sample consistently (%s)',
    (zone) => {
      for (let h = 0; h < 366 * 24; h += 1) {
        const stamp = new Date(Date.UTC(2026, 0, 1) + h * 3_600_000).toISOString();
        const date = stamp.slice(0, 10);
        const time = stamp.slice(11, 16);
        const strict = toInstant(date, time, zone);
        const got = toInstantCompatible(date, time, zone);
        const local = toLocal(got, zone);
        if (strict.kind === 'ok') {
          expect(got.getTime()).toBe(strict.instant.getTime());
        } else if (strict.kind === 'nonexistent') {
          // One hour gap: the result reads one hour later than the requested wall-clock.
          const later = toLocal(new Date(Date.UTC(2026, 0, 1) + (h + 1) * 3_600_000), 'UTC');
          expect(`${local.date} ${local.time}`).toBe(`${later.date} ${later.time}`);
        } else {
          // Overlap: the earlier of the two instants showing this wall-clock.
          expect(local).toEqual({ date, time });
          const other = new Date(got.getTime() + 3_600_000);
          expect(toLocal(other, zone)).toEqual({ date, time });
        }
      }
    },
  );

  it.each([
    ['Antarctica/Troll', '2026-03-29', '02:00', '2026-03-29T02:00:00.000Z'],
    ['Antarctica/Troll', '2026-10-25', '02:00', '2026-10-25T00:00:00.000Z'],
    ['Australia/Lord_Howe', '2026-10-04', '02:15', '2026-10-03T15:45:00.000Z'],
    ['America/Santiago', '2026-09-06', '00:30', '2026-09-06T04:30:00.000Z'],
  ])('resolves %s %s %s to %s', (zone, date, time, utc) => {
    expect(toInstantCompatible(date, time, zone).toISOString()).toBe(utc);
  });

  it('accepts HH:mm:00 and rejects 24:00 and non-zero seconds', () => {
    expect(toInstantCompatible('2026-11-02', '07:00:00', KOLKATA).toISOString()).toBe(
      '2026-11-02T01:30:00.000Z',
    );
    expect(instantOf('2026-11-02', '07:00:00', KOLKATA)).toBe('2026-11-02T01:30:00.000Z');
    expect(() => toInstantCompatible('2026-11-02', '24:00', KOLKATA)).toThrow(RangeError);
    expect(() => toInstantCompatible('2026-11-02', '07:00:01', KOLKATA)).toThrow(RangeError);
  });

  it('rejects malformed input', () => {
    expect(() => toInstantCompatible('2026-02-30', '09:00', LONDON)).toThrow(RangeError);
  });
});

describe('addDays and isoWeekday', () => {
  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('numbers weekdays Monday 1 to Sunday 7', () => {
    expect(isoWeekday('2026-11-02')).toBe(1);
    expect(isoWeekday('2026-11-08')).toBe(7);
  });
});
