/** Selection model and date helpers for occupancy marks (ui/04 section 2). Dates are YYYY-MM-DD. */

export interface Selection {
  selected: string[];
  /** The last seat toggled, where a Shift+Space range starts. */
  anchor: string | null;
}

export const EMPTY_SELECTION: Selection = { selected: [], anchor: null };

export function toggleOne(s: Selection, id: string): Selection {
  const selected = s.selected.includes(id)
    ? s.selected.filter((x) => x !== id)
    : [...s.selected, id];
  return { selected, anchor: id };
}

/** Adds the seats between the anchor and `id` (inclusive, in list order); earlier picks stay. */
export function selectRange(s: Selection, orderedIds: string[], id: string): Selection {
  const from = s.anchor === null ? -1 : orderedIds.indexOf(s.anchor);
  const to = orderedIds.indexOf(id);
  if (from < 0 || to < 0) return s.selected.includes(id) ? s : toggleOne(s, id);
  const [lo, hi] = from < to ? [from, to] : [to, from];
  const inRange = orderedIds.slice(lo, hi + 1);
  const selected = orderedIds.filter((x) => s.selected.includes(x) || inRange.includes(x));
  return { selected, anchor: id };
}

export function checkState(selected: string[], orderedIds: string[]): boolean | 'indeterminate' {
  const n = orderedIds.filter((id) => selected.includes(id)).length;
  if (n === 0) return false;
  return n === orderedIds.length ? true : 'indeterminate';
}

export function toggleAll(selected: string[], orderedIds: string[]): Selection {
  const all = checkState(selected, orderedIds) === true;
  return { selected: all ? [] : [...orderedIds], anchor: null };
}

const DAY = 86_400_000;
const time = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Consecutive days become one `[first, last]` range. */
export function foldDates(dates: string[]): [string, string][] {
  const sorted = [...new Set(dates)].sort();
  const out: [string, string][] = [];
  for (const d of sorted) {
    const last = out[out.length - 1];
    if (last && time(d) - time(last[1]) === DAY) last[1] = d;
    else out.push([d, d]);
  }
  return out;
}

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "Mon 2 Nov", with the year only when it is not the current one. */
export function formatDay(date: string, now = new Date()): string {
  const p = dayFormat.formatToParts(new Date(`${date}T00:00:00Z`));
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? '';
  const base = `${get('weekday')} ${get('day')} ${get('month')}`;
  return get('year') === String(now.getUTCFullYear()) ? base : `${base} ${get('year')}`;
}

export function formatMarkRange(start: string, end: string | null, now = new Date()): string {
  if (end === null) return `from ${formatDay(start, now)}, no end date`;
  return start === end
    ? formatDay(start, now)
    : `${formatDay(start, now)} to ${formatDay(end, now)}`;
}

export function formatRanges(ranges: [string, string][], now = new Date()): string {
  return ranges.map(([a, b]) => formatMarkRange(a, b, now)).join(', ');
}

export interface MarkDates {
  start: string;
  ends: 'open' | 'date';
  end: string;
}

export function validateMarkDates(v: MarkDates): { start?: string; end?: string } {
  if (v.start === '') return { start: 'Choose a start date.' };
  if (v.ends === 'date') {
    if (v.end === '') return { end: 'Choose an end date.' };
    if (v.end < v.start) return { end: "The end date can't be before the start date." };
  }
  return {};
}
