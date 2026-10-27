import { z } from 'zod';

import { isCountryCode, isCurrencyCode } from '../../reference/reference-data.js';
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
