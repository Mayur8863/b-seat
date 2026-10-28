import { describe, expect, it } from 'vitest';

import {
  CreateCubicleInputSchema,
  CreateSeatsInputSchema,
  UpdateSeatInputSchema,
} from './owner-seats.schemas.js';

const paths = (r: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) =>
  r.error?.issues.map((i) => i.path.join('.')) ?? [];

describe('seat schemas', () => {
  it('accepts a pattern and defaults features', () => {
    const out = CreateSeatsInputSchema.parse({ pattern: { prefix: 'A-', from: 1, to: 20 } });
    expect(out).toMatchObject({ features: [] });
  });

  it('refuses to < from and more than 200 labels on pattern.to', () => {
    const bad = CreateSeatsInputSchema.safeParse({ pattern: { prefix: 'A', from: 5, to: 4 } });
    expect(paths(bad)).toContain('pattern.to');
    const big = CreateSeatsInputSchema.safeParse({ pattern: { prefix: 'A', from: 1, to: 201 } });
    expect(paths(big)).toContain('pattern.to');
  });

  it('refuses a generated label over 20 characters on pattern.prefix', () => {
    const r = CreateSeatsInputSchema.safeParse({
      pattern: { prefix: 'abcdefghijklmno', from: 100000, to: 100005 },
    });
    expect(paths(r)).toContain('pattern.prefix');
  });

  it('limits features to 10, 40 chars, unique ignoring case', () => {
    const f = (features: string[]) => UpdateSeatInputSchema.safeParse({ features }).success;
    expect(f(Array.from({ length: 11 }, (_, i) => `f${i}`))).toBe(false);
    expect(f(['x'.repeat(41)])).toBe(false);
    expect(f(['Dock', 'dock'])).toBe(false);
    expect(f(['Dock', 'Monitor'])).toBe(true);
  });

  it('requires one field on seat update and allows a null cubicle', () => {
    expect(UpdateSeatInputSchema.safeParse({}).success).toBe(false);
    expect(UpdateSeatInputSchema.safeParse({ cubicleId: null }).success).toBe(true);
  });

  it('limits cubicle names to 100 characters after trim', () => {
    expect(CreateCubicleInputSchema.safeParse({ name: 'x'.repeat(101) }).success).toBe(false);
    expect(CreateCubicleInputSchema.parse({ name: ' Bay ' }).name).toBe('Bay');
  });
});
