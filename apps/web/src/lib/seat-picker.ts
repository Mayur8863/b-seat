/** Date helpers for the listing's start date and seat list (ui/03 4.3, 4.4). */

const MAX_DAYS_AHEAD = 30;

/** Today's calendar date in the space's zone as YYYY-MM-DD; the viewer's local date is wrong across zones. */
function todayIn(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** UX limit only; the server enforces it when booking. */
export function startDateRange(timeZone: string, now = new Date()): { min: string; max: string } {
  const min = todayIn(timeZone, now);
  return { min, max: addDays(min, MAX_DAYS_AHEAD) };
}

export function isStartDateAllowed(value: string, range: { min: string; max: string }): boolean {
  return value !== '' && value >= range.min && value <= range.max;
}

export function filterSeats<T extends { status: string }>(
  seats: T[],
  hideUnavailable: boolean,
): T[] {
  return hideUnavailable ? seats.filter((s) => s.status === 'free') : seats;
}

const instantFormat = (timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  });

/** "Thu 29 Oct 2026, 19:00 (Asia/Kolkata)". */
export function formatInstant(iso: string, timeZone: string): string {
  const p = instantFormat(timeZone).formatToParts(new Date(iso));
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}, ${get('hour')}:${get('minute')} (${timeZone})`;
}
