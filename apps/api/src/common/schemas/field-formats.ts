import { z } from 'zod';

import {
  isCountryCode,
  isCurrencyCode,
  isOfferedTimeZone,
} from '../../reference/reference-data.js';
import { STANDARD_UTILITIES } from '../../reference/utilities.js';

/*
 * Shared field formats (specs/001-seat-booking/contracts/README.md). They are unnamed
 * (no `.meta({ id })`) so they never become shared OpenAPI components; every named schema
 * belongs to one direction only.
 */

export const LocalDate = z.iso.date().describe("Date in the space's time zone (YYYY-MM-DD)");

export const LocalTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a time as HH:mm')
  .describe("Wall-clock time in the space's time zone (HH:mm)");

export const Instant = z.iso.datetime().describe('UTC instant (ISO 8601)');

export const TimeZone = z.string().describe('IANA time zone, e.g. Europe/London');

/** Input form of TimeZone: only zones BSeat offers, so stored ids stay canonical and comparable. */
export const OfferedTimeZone = z
  .string()
  .max(64)
  .refine(isOfferedTimeZone, 'Unknown or unsupported time zone')
  .describe('IANA time zone offered by GET /api/reference, e.g. Europe/London');

/*
 * Checked with refine, not .regex: the astral tag range needs the `u` flag, and a pattern in that
 * flavour fails OpenAPI "regex" format validation in the client generator.
 */
const PLAIN = /^(?:[^\p{Cc}\p{Cf}\u2028\u2029]|\u200D|\u200C|[\u{E0020}-\u{E007F}])*$/u;
const MULTILINE = /^(?:[^\p{Cc}\p{Cf}\u2028\u2029]|\u200D|\u200C|[\u{E0020}-\u{E007F}]|\n)*$/u;

/**
 * Free text without control characters (NUL makes Postgres reject the row with 22021), bidi
 * override and isolate characters (display spoofing), or invisible format characters (\p{Cf}:
 * zero-width spaces, LRM/RLM, U+061C, BOM) and U+2028/U+2029, which let two names look identical.
 * Allowed format characters: U+200D (ZWJ, emoji sequences), U+200C (ZWNJ, Persian and other
 * scripts) and U+E0020-U+E007F (emoji tags, subdivision flags). Written as alternation because
 * ESLint rejects joiners inside a character class.
 * Chain `.trim().min().max()` as needed.
 */
export const PlainText = z
  .string()
  .refine((v) => PLAIN.test(v), 'Contains control, invisible or bidi override characters');

/**
 * PlainText that may span lines: CRLF becomes LF, tabs become spaces, and `\n` is the only other
 * control character allowed. Built with `.overwrite` (not preprocess) so the OpenAPI output keeps
 * the string type and the field's trim/min/max: `MultilineText.trim().min(1).max(n)`.
 */
export const MultilineText = z
  .string()
  .overwrite((v) => v.replace(/\r\n/g, '\n').replace(/\t/g, ' '))
  .refine((v) => MULTILINE.test(v), 'Contains control, invisible or bidi override characters');

export const CountryCode = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .refine(isCountryCode, 'Unknown country code')
  .describe('ISO 3166-1 alpha-2 country code, e.g. IN');

export const CurrencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .refine(isCurrencyCode, 'Unknown or unsupported currency code')
  .describe('ISO 4217 currency code, e.g. INR');

export const StandardUtility = z.enum(STANDARD_UTILITIES);
