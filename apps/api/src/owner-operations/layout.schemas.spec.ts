import { describe, expect, it } from 'vitest';

import { SaveLayoutInputSchema } from './layout.schemas.js';

const id = '00000000-0000-4000-8000-000000000001';
const base = { version: 0, columns: 40, rows: 30 };
const box = { x: 0, y: 0, w: 1, h: 1 };

describe('SaveLayoutInputSchema', () => {
  it('accepts a seat with seatId, a cubicle with cubicleId and an area with a label', () => {
    const r = SaveLayoutInputSchema.safeParse({
      ...base,
      elements: [
        { kind: 'seat', seatId: id, ...box },
        { kind: 'cubicle', cubicleId: id, ...box },
        { kind: 'area', label: 'Kitchen', ...box },
      ],
    });
    expect(r.success).toBe(true);
  });

  it.each([
    [{ kind: 'seat', ...box }],
    [{ kind: 'seat', seatId: id, label: 'x', ...box }],
    [{ kind: 'area', seatId: id, label: 'x', ...box }],
    [{ kind: 'cubicle', ...box }],
  ])('rejects a mismatched element %j', (el) => {
    expect(SaveLayoutInputSchema.safeParse({ ...base, elements: [el] }).success).toBe(false);
  });

  it('rejects a grid outside 10 to 80 and a zero-size element', () => {
    expect(SaveLayoutInputSchema.safeParse({ ...base, columns: 81, elements: [] }).success).toBe(
      false,
    );
    const zero = { kind: 'area', label: 'A', x: 0, y: 0, w: 0, h: 1 };
    expect(SaveLayoutInputSchema.safeParse({ ...base, elements: [zero] }).success).toBe(false);
  });
});
