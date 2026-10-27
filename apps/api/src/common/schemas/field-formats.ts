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

/**
 * Free text without control characters (NUL makes Postgres reject the row with 22021) or the
 * bidi override and isolate characters U+202A-U+202E and U+2066-U+2069 (display spoofing).
 * Chain `.trim().min().max()` as needed.
 */
export const PlainText = z
  .string()
  .regex(/^[^\p{Cc}\u202A-\u202E\u2066-\u2069]*$/u, 'Contains control or bidi override characters');

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
