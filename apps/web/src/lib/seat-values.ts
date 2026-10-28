import type { CreateSeatsInputPattern } from '@bseat/api-client';

export const SEAT_LIMIT = 200;
export const LABEL_MAX = 20;

export function seatCountText(n: number): string {
  if (n === 0) return 'No seats yet';
  return n === 1 ? '1 seat' : `${n} seats`;
}

/** Comma list to features: trimmed, blanks dropped, repeats dropped ignoring case (ui/02 7.1). */
export function parseFeatures(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const f = part.trim();
    const key = f.toLowerCase();
    if (f === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export function featuresError(features: string[]): string | undefined {
  if (features.length > 10) return 'Use 10 features or fewer';
  if (features.some((f) => f.length > 40)) return 'Keep each feature to 40 characters or fewer';
  return undefined;
}

export interface PatternFields {
  prefix: string;
  from: string;
  to: string;
  padTo: string;
}

export interface PatternErrors {
  prefix?: string;
  from?: string;
  to?: string;
  padTo?: string;
}

const WHOLE = /^\d{1,9}$/;

export const labelFor = (prefix: string, n: number, padTo: number | undefined) =>
  `${prefix}${String(n).padStart(padTo ?? 0, '0')}`;

/** Field errors for the "Add many seats" form; `current` is how many seats the space already has. */
export function patternErrors(f: PatternFields, current: number): PatternErrors {
  const errors: PatternErrors = {};
  if (f.prefix.length > 15) errors.prefix = 'Use 15 characters or fewer';
  const from = WHOLE.test(f.from.trim()) ? Number(f.from) : undefined;
  if (from === undefined) errors.from = 'Enter a whole number, 0 or higher';
  const to = /^-?\d{1,9}$/.test(f.to.trim()) ? Number(f.to) : undefined;
  if (to === undefined) errors.to = 'Enter a whole number';
  const padRaw = f.padTo.trim();
  const pad = padRaw === '' ? undefined : /^[1-4]$/.test(padRaw) ? Number(padRaw) : NaN;
  if (Number.isNaN(pad)) errors.padTo = 'Enter a number from 1 to 4, or leave it empty';

  if (from !== undefined && to !== undefined) {
    const n = to - from + 1;
    if (to < from) errors.to = `Enter a number that is ${from} or higher`;
    else if (n > SEAT_LIMIT) {
      errors.to = `That adds ${n} seats. You can add up to ${SEAT_LIMIT} at once.`;
    } else if (current + n > SEAT_LIMIT) {
      errors.to = `That adds ${n} seats, but a space can have ${SEAT_LIMIT} and this one has ${current}. You can add ${SEAT_LIMIT - current} more.`;
    } else if (!errors.prefix && !errors.padTo) {
      const widest = labelFor(f.prefix, to, pad);
      if (widest.length > LABEL_MAX) {
        errors.prefix = `Labels can be up to ${LABEL_MAX} characters including the number. Shorten the prefix.`;
      }
    }
  }
  return errors;
}

export type PatternPreview =
  | { ok: false }
  | {
      ok: true;
      count: number;
      first: string;
      last: string;
      text: string;
      input: CreateSeatsInputPattern;
    };

export function patternPreview(f: PatternFields, current: number): PatternPreview {
  if (Object.keys(patternErrors(f, current)).length > 0) return { ok: false };
  const from = Number(f.from);
  const to = Number(f.to);
  const pad = f.padTo.trim() === '' ? undefined : Number(f.padTo);
  const count = to - from + 1;
  const first = labelFor(f.prefix, from, pad);
  const last = labelFor(f.prefix, to, pad);
  const text = count === 1 ? `Adds 1 seat: ${first}.` : `Adds ${count} seats: ${first} to ${last}.`;
  return {
    ok: true,
    count,
    first,
    last,
    text,
    input: { prefix: f.prefix, from, to, ...(pad === undefined ? {} : { padTo: pad }) },
  };
}
