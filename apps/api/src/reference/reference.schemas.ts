import { z } from 'zod';

import { TimeZone } from '../common/schemas/field-formats.js';
import { STANDARD_UTILITIES } from './utilities.js';

export const ReferenceSchema = z
  .object({
    countries: z.array(
      z.object({
        code: z.string().regex(/^[A-Z]{2}$/),
        name: z.string(),
        timeZones: z.array(TimeZone).describe('Suggested zones; the first is the default'),
      }),
    ),
    currencies: z.array(z.object({ code: z.string().regex(/^[A-Z]{3}$/), name: z.string() })),
    utilities: z.array(z.enum(STANDARD_UTILITIES)),
  })
  .meta({ id: 'Reference', description: 'Static lists used by listing and preference forms' });

export type Reference = z.infer<typeof ReferenceSchema>;
