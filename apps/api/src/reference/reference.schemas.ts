import { z } from 'zod';

import {
  CountryCode,
  CurrencyCode,
  StandardUtility,
  TimeZone,
} from '../common/schemas/field-formats.js';

export const ReferenceSchema = z
  .object({
    countries: z.array(
      z.object({
        code: CountryCode,
        name: z.string(),
        timeZones: z
          .array(TimeZone)
          .describe('Suggested zones (may be empty); the first is the default'),
      }),
    ),
    currencies: z.array(z.object({ code: CurrencyCode, name: z.string() })),
    utilities: z.array(StandardUtility),
  })
  .meta({ id: 'Reference', description: 'Static lists used by listing and preference forms' });

export type Reference = z.infer<typeof ReferenceSchema>;
