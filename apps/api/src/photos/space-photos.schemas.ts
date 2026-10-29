import { z } from 'zod';

import { Instant } from '../common/schemas/field-formats.js';

/** Photos per space (FR-002); the database CHECK is the backstop. */
export const PHOTO_LIMIT = 10;

export const PhotoImageSchema = z
  .object({
    url: z.url().describe('Signed, short-lived address of the image'),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .meta({ id: 'PhotoImage' });

export const OwnerSpacePhotoSchema = z
  .object({
    id: z.uuid(),
    position: z.number().int().min(1).max(PHOTO_LIMIT).describe('1 is the cover'),
    description: z.string().nullable(),
    altText: z.string().describe('The description, or "<space name> photo <position>"'),
    card: PhotoImageSchema.describe('640 by 480'),
    display: PhotoImageSchema.describe('Up to 1600 on the long edge'),
    createdAt: Instant,
  })
  .meta({ id: 'OwnerSpacePhoto' });
export type OwnerSpacePhoto = z.infer<typeof OwnerSpacePhotoSchema>;
