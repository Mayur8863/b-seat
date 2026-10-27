import { addDays, toInstantCompatible } from '../common/time/zoned-time.js';

/** Local `HH:mm`. */
export type OpeningHours =
  | { mode: 'always_open'; shiftChangeAt: string }
  | { mode: 'fixed_hours'; opensAt: string; closesAt: string };

export type SlotKind = 'day' | 'night' | 'full_day' | 'working_hours';

export interface SlotWindow {
  startsAt: Date;
  endsAt: Date;
}

export function offeredSlots(openingHours: OpeningHours): SlotKind[] {
  return openingHours.mode === 'always_open' ? ['day', 'night', 'full_day'] : ['working_hours'];
}

/** The local time 12 wall-clock hours after `time`, and whether it falls on the next date. */
function halfwayPoint(time: string): { time: string; nextDay: boolean } {
  const [h = 0, m = 0] = time.split(':').map(Number);
  const hour = (h + 12) % 24;
  return {
    time: `${String(hour).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
    nextDay: h >= 12,
  };
}

/**
 * The half-open window of a slot that starts on local `date` (R-4). Each boundary is converted
 * once through the "compatible" rule, so adjacent slots share an exact instant.
 */
export function slotWindow(
  openingHours: OpeningHours,
  slot: SlotKind,
  date: string,
  timeZone: string,
): SlotWindow {
  const at = (d: string, t: string) => toInstantCompatible(d, t, timeZone);
  let window: SlotWindow;

  if (openingHours.mode === 'fixed_hours') {
    if (slot !== 'working_hours')
      throw new RangeError(`Slot ${slot} is not offered by fixed hours`);
    window = {
      startsAt: at(date, openingHours.opensAt),
      endsAt: at(date, openingHours.closesAt),
    };
  } else {
    const shift = openingHours.shiftChangeAt;
    const half = halfwayPoint(shift);
    const halfDate = half.nextDay ? addDays(date, 1) : date;
    if (slot === 'day') {
      window = { startsAt: at(date, shift), endsAt: at(halfDate, half.time) };
    } else if (slot === 'night') {
      window = { startsAt: at(halfDate, half.time), endsAt: at(addDays(date, 1), shift) };
    } else if (slot === 'full_day') {
      window = { startsAt: at(date, shift), endsAt: at(addDays(date, 1), shift) };
    } else {
      throw new RangeError(`Slot ${slot} is not offered by 24-hour spaces`);
    }
  }

  // A tzdata anomaly rather than user input, so fail loudly.
  if (window.endsAt.getTime() <= window.startsAt.getTime()) {
    throw new RangeError(`Slot ${slot} on ${date} ends before it starts`);
  }
  return window;
}

/** Where a local day starts for occupancy marks (R-11): the shift change, or midnight. */
export function dayBoundary(openingHours: OpeningHours, date: string, timeZone: string): Date {
  const time = openingHours.mode === 'always_open' ? openingHours.shiftChangeAt : '00:00';
  return toInstantCompatible(date, time, timeZone);
}
