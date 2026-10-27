import { z } from 'zod';

import { ACCOUNT_TYPES } from '../auth/account-type.js';
import { CountryCode } from '../common/schemas/field-formats.js';

const City = z.string().trim().min(1).max(100);

export const UpdatePreferencesInputSchema = z
  .strictObject({
    country: CountryCode.nullable(),
    city: City.nullable(),
    area: City.nullable(),
  })
  .meta({
    id: 'UpdatePreferencesInput',
    description: 'Renter search defaults; all null clears them',
  });

export type UpdatePreferencesInput = z.infer<typeof UpdatePreferencesInputSchema>;

export const PreferencesSchema = z
  .object({
    country: CountryCode.nullable(),
    city: z.string().nullable(),
    area: z.string().nullable(),
  })
  .meta({ id: 'Preferences', description: 'Renter search defaults' });

export type Preferences = z.infer<typeof PreferencesSchema>;

export const MeSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    accountType: z.enum(ACCOUNT_TYPES),
    preferences: PreferencesSchema.nullable(),
  })
  .meta({ id: 'Me', description: 'The signed-in user' });

export type Me = z.infer<typeof MeSchema>;
