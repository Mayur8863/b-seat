import { addDays } from '../common/time/zoned-time.js';
import { isOpen, type Calendar } from './calendar-rules.js';
import { slotWindow, type OpeningHours, type SlotKind, type SlotWindow } from './slots.js';

export type PassType = 'day' | 'week' | 'month';

const PASS_DAYS: Record<PassType, number> = { day: 1, week: 7, month: 30 };

export interface PassOccurrence extends SlotWindow {
  date: string;
}

export interface PassPeriod {
  endDate: string;
  /** False when the calendar closes the start date: the pass cannot be booked (AC 6.4). */
  startDayOpen: boolean;
  occurrences: PassOccurrence[];
  /** Closed dates inside the pass: no window, so no hold (FR-017). */
  skippedDates: string[];
}

export function passPeriod(input: {
  pass: PassType;
  slot: SlotKind;
  startDate: string;
  calendar: Calendar;
  openingHours: OpeningHours;
  timeZone: string;
}): PassPeriod {
  const { pass, slot, startDate, calendar, openingHours, timeZone } = input;
  const occurrences: PassOccurrence[] = [];
  const skippedDates: string[] = [];

  for (let i = 0; i < PASS_DAYS[pass]; i += 1) {
    const date = addDays(startDate, i);
    if (isOpen(calendar, date)) {
      occurrences.push({ date, ...slotWindow(openingHours, slot, date, timeZone) });
    } else {
      skippedDates.push(date);
    }
  }

  return {
    endDate: addDays(startDate, PASS_DAYS[pass] - 1),
    startDayOpen: isOpen(calendar, startDate),
    occurrences,
    skippedDates,
  };
}
