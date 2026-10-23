/** Display formats for booking windows (ui.md section 7). Never converts to the browser's zone. */

const dateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "2026-10-23" -> "Fri 23 Oct 2026". Joins parts so CLDR punctuation cannot change the result. */
export function formatLocalDate(date: string): string {
  const parts = dateFormat.formatToParts(new Date(`${date}T00:00:00Z`));
  return (['weekday', 'day', 'month', 'year'] as const)
    .map((type) => parts.find((part) => part.type === type)?.value)
    .filter(Boolean)
    .join(' ');
}

export interface LocalWindow {
  date: string;
  startTime: string;
  endTime: string;
}

/** "Fri 23 Oct 2026, 09:00–17:00 (Europe/London)". */
export function formatWhen(window: LocalWindow, timeZone: string): string {
  return `${formatLocalDate(window.date)}, ${window.startTime}–${window.endTime} (${timeZone})`;
}

/** Quarter-hour "HH:mm" slots from `from` to `to` inclusive. */
export function timeSlots(from: string, to: string): string[] {
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  const slots: string[] = [];
  for (let m = minutes(from); m <= minutes(to); m += 15) {
    slots.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return slots;
}

/** The browser's calendar date tomorrow as YYYY-MM-DD (ui.md 3.3 default). */
export function tomorrow(now = new Date()): string {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}
