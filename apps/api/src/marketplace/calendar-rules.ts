import { isoWeekday } from '../common/time/zoned-time.js';

/** `endDate` null = open-ended. `weekdays` is a bitmask, Monday = 1 ... Sunday = 64. */
export interface Calendar {
  startDate: string;
  endDate: string | null;
  weekdays: number;
}

const WEEKDAY_BITS = { mon: 1, tue: 2, wed: 4, thu: 8, fri: 16, sat: 32, sun: 64 } as const;

export function weekdayMask(days: readonly (keyof typeof WEEKDAY_BITS)[]): number {
  return days.reduce((mask, day) => mask | WEEKDAY_BITS[day], 0);
}

/** ISO date strings compare correctly as text. */
export function isOpen(calendar: Calendar, date: string): boolean {
  if (date < calendar.startDate) return false;
  if (calendar.endDate !== null && date > calendar.endDate) return false;
  return (calendar.weekdays & (1 << (isoWeekday(date) - 1))) !== 0;
}

/** A seat's own calendar wins; otherwise the space's shared one (R-5). */
export function resolveCalendar(own: Calendar | null, shared: Calendar): Calendar {
  return own ?? shared;
}
