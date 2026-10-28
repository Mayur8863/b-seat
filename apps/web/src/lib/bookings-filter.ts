import { formatLocalDate } from './booking-format';

export interface DateRange {
  from: string;
  to: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** ISO dates compare correctly as strings. */
export function rangeError(from: string, to: string): string | undefined {
  return from && to && to < from ? "To can't be before From." : undefined;
}

export function parseRange(params: URLSearchParams): DateRange {
  const pick = (key: string) => {
    const value = params.get(key) ?? '';
    return ISO_DATE.test(value) ? value : '';
  };
  return { from: pick('from'), to: pick('to') };
}

export function rangeToQuery({ from, to }: DateRange): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function appliedLine({ from, to }: DateRange): string | undefined {
  if (from && to)
    return `Showing bookings from ${formatLocalDate(from)} to ${formatLocalDate(to)}.`;
  if (from) return `Showing bookings from ${formatLocalDate(from)}.`;
  if (to) return `Showing bookings until ${formatLocalDate(to)}.`;
  return undefined;
}
