/**
 * Space-local wall-clock time <-> UTC instants, using only Node's built-in ICU (`Intl`).
 * The single place that does time-zone arithmetic (research R-1, ADR-0008 section 1).
 */

/** `YYYY-MM-DD` and `HH:mm` in a space's local time. */
export interface LocalDateTime {
  date: string;
  time: string;
}

export type ToInstantResult =
  | { kind: 'ok'; instant: Date }
  /** The wall-clock falls into a DST gap (clocks jumped over it). */
  | { kind: 'nonexistent' }
  /** The wall-clock happens twice (DST overlap). */
  | { kind: 'ambiguous' };

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    // Throws RangeError for an unknown zone. h23 avoids "24:00" at midnight.
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClockAt(epochMs: number, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const part of formatterFor(timeZone).formatToParts(epochMs)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year ?? Number.NaN,
    month: parts.month ?? Number.NaN,
    day: parts.day ?? Number.NaN,
    hour: parts.hour ?? Number.NaN,
    minute: parts.minute ?? Number.NaN,
    second: parts.second ?? Number.NaN,
  };
}

/** The zone's UTC offset (ms) in force at an instant. */
function offsetAt(epochMs: number, timeZone: string): number {
  const w = wallClockAt(epochMs, timeZone);
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // The formatter has whole-second resolution, so compare against the whole second.
  return wallAsUtc - Math.floor(epochMs / 1000) * 1000;
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Formats an instant as the zone's local `{ date, time }` (seconds dropped). */
export function toLocal(instant: Date, timeZone: string): LocalDateTime {
  const w = wallClockAt(instant.getTime(), timeZone);
  return {
    date: `${pad(w.year, 4)}-${pad(w.month)}-${pad(w.day)}`,
    time: `${pad(w.hour)}:${pad(w.minute)}`,
  };
}

/** The wall-clock read as if it were UTC (ms); throws RangeError for malformed input. */
function wallClockAsUtc(date: string, time: string): number {
  const d = DATE_PATTERN.exec(date);
  const t = TIME_PATTERN.exec(time);
  if (!d || !t) throw new RangeError(`Invalid local date or time: ${date} ${time}`);
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const ms = Date.UTC(year, month - 1, day, Number(t[1]), Number(t[2]));
  const check = new Date(ms);
  // Date.UTC rolls 2026-02-30 over to March; refuse it instead.
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
  return ms;
}

/**
 * Converts a local wall-clock time in `timeZone` to a UTC instant. Never shifts a time:
 * a wall-clock in a DST gap is `nonexistent`, one in a DST overlap is `ambiguous`.
 *
 * Algorithm (ADR-0008 section 1): take the zone's offsets one day either side of the
 * wall-clock; each distinct offset gives a candidate instant, which counts only if it
 * reads back as the requested wall-clock.
 */
export function toInstant(date: string, time: string, timeZone: string): ToInstantResult {
  const wall = wallClockAsUtc(date, time);
  const offsets = new Set([offsetAt(wall - DAY_MS, timeZone), offsetAt(wall + DAY_MS, timeZone)]);
  const matches = [...offsets]
    .map((offset) => new Date(wall - offset))
    .filter((candidate) => {
      const local = toLocal(candidate, timeZone);
      return local.date === date && local.time === time;
    });

  const [only] = matches;
  if (matches.length === 1 && only) return { kind: 'ok', instant: only };
  return matches.length === 0 ? { kind: 'nonexistent' } : { kind: 'ambiguous' };
}

/**
 * True if the runtime knows the IANA zone. (Not `Intl.supportedValuesOf`, which lists CLDR
 * canonical ids and can omit valid aliases such as `Asia/Kolkata`.)
 */
export function isValidTimeZone(timeZone: string): boolean {
  if (timeZone.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Like `toInstant`, but never refuses: for owner-set boundaries (ADR-0009 section 4, amends
 * ADR-0008 section 1). A time in a DST gap or overlap takes the offset in force before the
 * transition, so a gap resolves to the instant after the gap and an overlap to the earlier
 * instant. Throws RangeError for malformed input.
 */
export function toInstantCompatible(date: string, time: string, timeZone: string): Date {
  const strict = toInstant(date, time, timeZone);
  if (strict.kind === 'ok') return strict.instant;
  const wall = wallClockAsUtc(date, time);
  return new Date(wall - offsetAt(wall - DAY_MS, timeZone));
}

/** Adds calendar days to a `YYYY-MM-DD` date (pure date arithmetic, no zone involved). */
export function addDays(date: string, days: number): string {
  const ms = wallClockAsUtc(date, '00:00') + days * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO weekday of a local date: Monday = 1 ... Sunday = 7. */
export function isoWeekday(date: string): number {
  const day = new Date(wallClockAsUtc(date, '00:00')).getUTCDay();
  return day === 0 ? 7 : day;
}
