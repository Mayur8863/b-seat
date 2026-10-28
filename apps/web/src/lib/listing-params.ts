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
  const pass = params.get('pass');
  const slot = params.get('slot');
  const offer = offers.find((o) => o.slot === slot);
  if (
    !offer ||
    !(pass === 'day' || pass === 'week' || pass === 'month') ||
    offer.prices[pass] === null
  ) {
    return { choice: null, startDate: '' };
  }
  const date = params.get('startDate') ?? '';
  return {
    choice: { pass, slot: offer.slot },
    startDate: isStartDateAllowed(date, range) ? date : '',
  };
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

/** The search part of the URL without the booking choice, for "Back to results". */
export function searchOnly(current: URLSearchParams): string {
  return withListingParams(current, null, '');
}
