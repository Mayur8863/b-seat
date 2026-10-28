import type { OwnerSpace } from '@bseat/api-client';
import { describe, expect, it } from 'vitest';

import {
  createBody,
  fieldForPath,
  type FormValues,
  schema,
  updateBody,
  valuesFor,
} from './space-form-values';

const valid: FormValues = {
  ...valuesFor(),
  name: 'Hub',
  description: 'Quiet desks',
  country: 'IN',
  city: 'Pune',
  area: 'Baner',
  streetAddress: '1 Main Rd',
  timeZone: 'Asia/Kolkata',
  currency: 'INR',
  mode: 'always_open',
};

const errorsOf = (over: Partial<FormValues>) => {
  const r = schema.safeParse({ ...valid, ...over });
  return r.success ? [] : r.error.issues.map((i) => String(i.path[0]));
};

describe('schema characters', () => {
  it.each([
    ['tab', 'a\tb'],
    ['newline in a single-line field', 'a\nb'],
    ['zero-width space', 'a​b'],
    ['bidi override', 'a‮b'],
    ['bidi isolate', 'a⁦b'],
    ['line separator', 'a b'],
    ['BOM', 'a﻿b'],
  ])('rejects %s in a name', (_n, name) => {
    expect(errorsOf({ name })).toEqual(['name']);
  });

  it.each([
    ['Persian ZWNJ', 'خانه‌ها'],
    ['ZWJ emoji', '👩‍💻 Hub'],
    ['England flag', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F} Hub'],
  ])('accepts %s', (_n, name) => {
    expect(errorsOf({ name })).toEqual([]);
  });

  it('lets the description span lines, turns tabs into spaces and rejects hidden characters', () => {
    expect(errorsOf({ description: 'a\r\nb\tc' })).toEqual([]);
    expect(createBody({ ...valid, description: ' a\r\nb\tc ' }).description).toBe('a\nb c');
    expect(errorsOf({ description: 'a​b' })).toEqual(['description']);
    expect(errorsOf({ description: 'a\u0007b' })).toEqual(['description']);
  });

  it('requires a time for the chosen opening-hours mode', () => {
    expect(errorsOf({ mode: '' })).toEqual(['mode']);
    expect(errorsOf({ mode: 'fixed_hours', opensAt: '09:00', closesAt: '09:00' })).toEqual([
      'closesAt',
    ]);
    expect(errorsOf({ shiftChangeAt: '12:00' })).toEqual(['shiftChangeAt']);
  });
});

describe('fieldForPath', () => {
  it('maps API paths to form fields', () => {
    expect(fieldForPath('name')).toBe('name');
    expect(fieldForPath('openingHours.closesAt')).toBe('closesAt');
    expect(fieldForPath('openingHours')).toBe('mode');
    expect(fieldForPath('customUtilities.2')).toBe('customUtilities');
    expect(fieldForPath('utilities.0')).toBe('utilities');
    expect(fieldForPath('nope')).toBeUndefined();
  });
});

describe('bodies', () => {
  const space = {
    name: 'Hub',
    description: 'A hub',
    country: 'IN',
    city: 'Pune',
    area: 'Baner',
    streetAddress: '1 Main Rd',
    timeZone: 'Asia/Kolkata',
    currency: 'INR',
    openingHours: { mode: 'fixed_hours', opensAt: '09:00', closesAt: '18:00' },
    utilities: ['wifi'],
    customUtilities: ['Gym'],
  } as OwnerSpace;

  it('createBody trims and builds the opening hours of the chosen mode', () => {
    const body = createBody({ ...valid, name: ' Hub ', opensAt: '09:00' });
    expect(body.name).toBe('Hub');
    expect(body.openingHours).toEqual({ mode: 'always_open', shiftChangeAt: '07:00' });
  });

  it('updateBody sends nothing when nothing changed and only changes otherwise', () => {
    const base = valuesFor(space);
    expect(updateBody({ ...base, name: ' Hub ' }, base)).toEqual({});
    expect(updateBody({ ...base, city: 'Mumbai', utilities: [] }, base)).toEqual({
      city: 'Mumbai',
      utilities: [],
    });
    expect(updateBody({ ...base, closesAt: '19:00' }, base).openingHours).toEqual({
      mode: 'fixed_hours',
      opensAt: '09:00',
      closesAt: '19:00',
    });
  });
});
