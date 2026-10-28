import type { Listing } from '@bseat/api-client';

import type { PassChoice } from '@/components/pass-options';

import { isStartDateAllowed } from './seat-picker';

const KEYS = ['pass', 'slot', 'startDate'] as const;

/** Preselection from the listing URL (ui/03 4.2, 4.3); anything not offered or out of range is dropped. */
export function parseListingParams(
  params: URLSearchParams,
  offers: Pick<Listing['offers'][number], 'slot' | 'prices'>[],
  range: { min: string; max: string },
): { choice: PassChoice | null; startDate: string } {
  const date = params.get('startDate') ?? '';
  const startDate = isStartDateAllowed(date, range) ? date : '';
  const slot = params.get('slot');
  const given = params.get('pass');
  // A search with only a start date treats it as a day pass (OQ-4); take the first offer that sells one.
  const dayOnly = given === null && slot === null && startDate !== '';
  const pass = dayOnly ? 'day' : given;
  const offer = dayOnly
    ? offers.find((o) => o.prices.day !== null)
    : offers.find((o) => o.slot === slot);
  if (
    !offer ||
    !(pass === 'day' || pass === 'week' || pass === 'month') ||
    offer.prices[pass] === null
  ) {
    return { choice: null, startDate };
  }
  return { choice: { pass, slot: offer.slot }, startDate };
}

/** The query string with pass, slot and startDate set (or removed when empty); other params stay. */
export function withListingParams(
  current: URLSearchParams,
  choice: PassChoice | null,
  startDate: string,
): string {
  const next = new URLSearchParams(current);
  for (const k of KEYS) next.delete(k);
  if (choice) {
    next.set('pass', choice.pass);
    next.set('slot', choice.slot);
    if (startDate) next.set('startDate', startDate);
  }
  return next.toString();
}
