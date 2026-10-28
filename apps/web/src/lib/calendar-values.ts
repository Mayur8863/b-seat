import type { Calendar, CalendarInput } from '@bseat/api-client';

import { formatDay } from './occupancy-values';

export type Weekday = CalendarInput['weekdays'][number];

export const WEEKDAYS: readonly { key: Weekday; short: string; full: string }[] = [
  { key: 'mon', short: 'Mon', full: 'Monday' },
  { key: 'tue', short: 'Tue', full: 'Tuesday' },
  { key: 'wed', short: 'Wed', full: 'Wednesday' },
  { key: 'thu', short: 'Thu', full: 'Thursday' },
  { key: 'fri', short: 'Fri', full: 'Friday' },
  { key: 'sat', short: 'Sat', full: 'Saturday' },
  { key: 'sun', short: 'Sun', full: 'Sunday' },
];

export const PRESETS: Record<'everyDay' | 'weekdays' | 'weekends', readonly Weekday[]> = {
  everyDay: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
  weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'],
  weekends: ['sat', 'sun'],
};

const ORDER = WEEKDAYS.map((d) => d.key);
const sorted = (days: readonly Weekday[]) =>
  [...new Set(days)].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

/** "Every day", "Mon to Fri", "Sat and Sun", otherwise the short names (ui/04 3.2). */
export function weekdaySummary(days: readonly Weekday[]): string {
  const list = sorted(days);
  const is = (preset: readonly Weekday[]) =>
    list.length === preset.length && preset.every((d) => list.includes(d));
  if (is(PRESETS.everyDay)) return 'Every day';
  if (is(PRESETS.weekdays)) return 'Mon to Fri';
  if (is(PRESETS.weekends)) return 'Sat and Sun';
  return list.map((d) => WEEKDAYS[ORDER.indexOf(d)]?.short ?? d).join(', ');
}

export function calendarSummary(c: Calendar, now = new Date()): string {
  const days = weekdaySummary(c.weekdays);
  return c.endDate === null
    ? `From ${formatDay(c.startDate, now)}, no end date, ${days}`
    : `${formatDay(c.startDate, now)} to ${formatDay(c.endDate, now)}, ${days}`;
}

export interface CalendarValues {
  start: string;
  ends: 'open' | 'date';
  end: string;
  weekdays: Weekday[];
}

export function fromCalendar(c: Calendar): CalendarValues {
  return {
    start: c.startDate,
    ends: c.endDate === null ? 'open' : 'date',
    end: c.endDate ?? '',
    weekdays: sorted(c.weekdays),
  };
}

export function toCalendarInput(v: CalendarValues): CalendarInput {
  return {
    startDate: v.start,
    endDate: v.ends === 'date' ? v.end : null,
    weekdays: sorted(v.weekdays),
  };
}

/** No minimum on the start date: the API decides (OQ-T46-4). */
export function validateCalendar(v: CalendarValues): {
  start?: string;
  end?: string;
  weekdays?: string;
} {
  const errors: { start?: string; end?: string; weekdays?: string } = {};
  if (v.start === '') errors.start = 'Choose a start date.';
  if (v.ends === 'date') {
    if (v.end === '') errors.end = 'Choose an end date.';
    else if (v.start !== '' && v.end < v.start) {
      errors.end = "The end date can't be before the start date.";
    }
  }
  if (v.weekdays.length === 0) errors.weekdays = 'Choose at least one day.';
  return errors;
}

export const outsideNotice = (n: number) =>
  n === 1
    ? '1 booking falls outside the new calendar'
    : `${n} bookings fall outside the new calendar`;
