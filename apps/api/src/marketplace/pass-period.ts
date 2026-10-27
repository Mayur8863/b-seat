import { addDays, toInstantCompatible } from '../common/time/zoned-time.js';
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

interface PassPeriodInput {
  pass: PassType;
  slot: SlotKind;
  startDate: string;
  calendar: Calendar;
  openingHours: OpeningHours;
  timeZone: string;
}

/** Fixed hours inside one DST gap collapse to nothing (end <= start): that date is closed. */
function tryWindow(input: PassPeriodInput, date: string): SlotWindow | null {
  try {
    return slotWindow(input.openingHours, input.slot, date, input.timeZone);
  } catch (error) {
    if (error instanceof RangeError && input.openingHours.mode === 'fixed_hours') {
      const { opensAt, closesAt } = input.openingHours;
      const at = (t: string) => toInstantCompatible(date, t, input.timeZone).getTime();
      if (at(closesAt) <= at(opensAt)) return null;
    }
    throw error;
  }
}

export function passPeriod(input: PassPeriodInput): PassPeriod {
  const { pass, startDate, calendar } = input;
  const occurrences: PassOccurrence[] = [];
  const skippedDates: string[] = [];

  for (let i = 0; i < PASS_DAYS[pass]; i += 1) {
    const date = addDays(startDate, i);
    const window = isOpen(calendar, date) ? tryWindow(input, date) : null;
    if (window) occurrences.push({ date, ...window });
    else skippedDates.push(date);
  }

  return {
    endDate: addDays(startDate, PASS_DAYS[pass] - 1),
    startDayOpen: isOpen(calendar, startDate),
    occurrences,
    skippedDates,
  };
}
