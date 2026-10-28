import { describe, expect, it } from 'vitest';

import { CreateSpaceInputSchema, UpdateSpaceInputSchema } from './owner-spaces.schemas.js';

const valid = {
  name: ' Hub ',
  description: 'Desk space',
  country: 'IN',
  city: 'Pune',
  area: 'Baner',
  streetAddress: '1 Road',
  timeZone: 'Asia/Kolkata',
  currency: 'INR',
  openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
};

describe('owner space schemas', () => {
  it('trims text and defaults the utility lists on create', () => {
    const out = CreateSpaceInputSchema.parse(valid);
    expect(out).toMatchObject({ name: 'Hub', utilities: [], customUtilities: [] });
  });

  it('refuses closing at or before opening and a late shift change', () => {
    const fixed = { mode: 'fixed_hours', opensAt: '09:00', closesAt: '09:00' };
    expect(CreateSpaceInputSchema.safeParse({ ...valid, openingHours: fixed }).success).toBe(false);
    const late = { mode: 'always_open', shiftChangeAt: '12:00' };
    expect(CreateSpaceInputSchema.safeParse({ ...valid, openingHours: late }).success).toBe(false);
  });

  it('keeps absent update fields absent and requires at least one', () => {
    expect(UpdateSpaceInputSchema.parse({ name: 'X' })).toEqual({ name: 'X' });
    expect(UpdateSpaceInputSchema.safeParse({}).success).toBe(false);
    expect(UpdateSpaceInputSchema.safeParse({ ownerId: 'x', name: 'X' }).success).toBe(false);
  });
});
