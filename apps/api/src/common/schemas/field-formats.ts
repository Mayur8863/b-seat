import { z } from 'zod';

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
