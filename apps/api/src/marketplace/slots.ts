import { addDays, parseLocalTime, toInstantCompatible } from '../common/time/zoned-time.js';

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
  if (openingHours.mode === 'fixed_hours') return ['working_hours'];
  halfwayTime(openingHours.shiftChangeAt);
  return ['day', 'night', 'full_day'];
}

/**
 * The shift change must be 00:00-11:59 so the night slot (T + 12 h) starts on its own date, as
 * the spec says. Owner input is validated upstream; this is the last line of defence.
 */
function halfwayTime(shiftChangeAt: string): string {
  const { hour, minute } = parseLocalTime(shiftChangeAt);
  if (hour >= 12) throw new RangeError(`Shift change ${shiftChangeAt} must be before 12:00`);
  return `${String(hour + 12).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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
    const half = halfwayTime(shift);
    if (slot === 'day') {
      window = { startsAt: at(date, shift), endsAt: at(date, half) };
    } else if (slot === 'night') {
      window = { startsAt: at(date, half), endsAt: at(addDays(date, 1), shift) };
    } else if (slot === 'full_day') {
      window = { startsAt: at(date, shift), endsAt: at(addDays(date, 1), shift) };
    } else {
      throw new RangeError(`Slot ${slot} is not offered by 24-hour spaces`);
    }
  }

  // Either a tzdata anomaly or owner fixed hours that fall inside one DST gap (both ends resolve
  // to the same instant). passPeriod treats the latter as a closed date.
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
