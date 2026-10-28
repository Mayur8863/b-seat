import { describe, expect, it } from 'vitest';
import type { OwnerLayout } from '@bseat/api-client';
import {
  type Action,
  type DraftState,
  createDraft,
  isSeatOutsideCubicle,
  neighbour,
  readingOrder,
  reduce,
  toSaveInput,
  validate,
} from './model';

const SEAT_A = '11111111-1111-4111-8111-111111111111';
const SEAT_B = '22222222-2222-4222-8222-222222222222';
const SEAT_C = '33333333-3333-4333-8333-333333333333';
const CUB = '44444444-4444-4444-8444-444444444444';
const CUB2 = '55555555-5555-4555-8555-555555555555';

const el = (
  id: string,
  kind: 'seat' | 'cubicle' | 'area',
  x: number,
  y: number,
  w: number,
  h: number,
  extra: { seatId?: string; cubicleId?: string; label?: string } = {},
) => ({
  id,
  kind,
  seatId: extra.seatId ?? null,
  cubicleId: extra.cubicleId ?? null,
  label: extra.label ?? id,
  x,
  y,
  w,
  h,
});

function draft(elements: OwnerLayout['elements'] = [], columns = 20, rows = 12): DraftState {
  return createDraft({ columns, rows, version: 3, elements, unplacedSeatIds: [] });
}
const run = (s: DraftState, ...actions: Action[]) => actions.reduce(reduce, s);

// A cubicle at (2,2) 6x4 holding seat A at (3,3) 2x2.
const withCubicle = () =>
  draft([
    el('c', 'cubicle', 2, 2, 6, 4, { cubicleId: CUB }),
    el('a', 'seat', 3, 3, 2, 2, { seatId: SEAT_A, cubicleId: CUB }),
  ]);
const rectOf = (s: DraftState, id: string) => {
  const e = s.elements.find((x) => x.id === id);
  if (!e) throw new Error(`missing ${id}`);
  return { x: e.x, y: e.y, w: e.w, h: e.h };
};

describe('createDraft', () => {
  it('adopts the layout, clean and with nothing selected', () => {
    const s = withCubicle();
    expect(s).toMatchObject({
      columns: 20,
      rows: 12,
      version: 3,
      selectedId: null,
      grabbed: null,
      dirty: false,
      blocked: null,
    });
    expect(s.elements).toHaveLength(2);
    expect(s.elements[1]).toMatchObject({ kind: 'seat', seatId: SEAT_A, cubicleId: CUB });
  });
});

describe('select and clear', () => {
  it('selects one item at most and clears', () => {
    const s = run(withCubicle(), { type: 'select', id: 'c' }, { type: 'select', id: 'a' });
    expect(s.selectedId).toBe('a');
    expect(reduce(s, { type: 'clear' }).selectedId).toBeNull();
  });
  it('ignores an unknown id', () => {
    expect(reduce(withCubicle(), { type: 'select', id: 'zzz' }).selectedId).toBeNull();
  });
  it('does not mark the draft dirty', () => {
    expect(reduce(withCubicle(), { type: 'select', id: 'a' }).dirty).toBe(false);
  });
});

describe('place', () => {
  it('places a seat 2x2 at the first free spot and selects it', () => {
    const s = reduce(draft(), { type: 'place', kind: 'seat', ref: SEAT_A, label: 'A-1' });
    expect(s.elements).toEqual([
      expect.objectContaining({
        kind: 'seat',
        seatId: SEAT_A,
        label: 'A-1',
        x: 0,
        y: 0,
        w: 2,
        h: 2,
      }),
    ]);
    expect(s.selectedId).toBe(s.elements[0]?.id);
    expect(s.dirty).toBe(true);
  });
  it('uses 6x4 for cubicles and areas', () => {
    const s = run(
      draft(),
      { type: 'place', kind: 'cubicle', ref: CUB, label: 'Pod' },
      { type: 'place', kind: 'area', ref: 'new-1', label: 'Kitchen' },
    );
    expect(s.elements.map((e) => [e.kind, e.w, e.h])).toEqual([
      ['cubicle', 6, 4],
      ['area', 6, 4],
    ]);
    expect(s.elements[1]).toMatchObject({ label: 'Kitchen', x: 0, y: 0 });
  });
  it('scans rows top to bottom then columns, skipping same-kind overlaps', () => {
    const s = run(
      draft(),
      { type: 'place', kind: 'seat', ref: SEAT_A },
      { type: 'place', kind: 'seat', ref: SEAT_B },
    );
    expect(rectOf(s, s.elements[0]?.id ?? '')).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    expect(rectOf(s, s.elements[1]?.id ?? '')).toEqual({ x: 2, y: 0, w: 2, h: 2 });
  });
  it('a seat may be placed over a cubicle', () => {
    const s = run(
      draft(),
      { type: 'place', kind: 'cubicle', ref: CUB, label: 'Pod' },
      { type: 'place', kind: 'seat', ref: SEAT_A, cubicleId: CUB },
    );
    expect(s.elements[1]).toMatchObject({ x: 0, y: 0, cubicleId: CUB });
  });
  it('returns no-space when nothing fits', () => {
    const s = reduce(draft([], 10, 10), { type: 'place', kind: 'area', ref: 'x', label: 'a' });
    const full = run(
      s,
      { type: 'place', kind: 'area', ref: 'y', label: 'b' },
      { type: 'place', kind: 'area', ref: 'z', label: 'c' },
      { type: 'place', kind: 'area', ref: 'w', label: 'd' },
      { type: 'place', kind: 'area', ref: 'v', label: 'e' },
    );
    expect(full.blocked).toEqual({ reason: 'no-space' });
    expect(full.elements.filter((e) => e.kind === 'area').length).toBeLessThan(5);
  });
  it('refuses placing an id that is already placed', () => {
    const s = run(
      draft(),
      { type: 'place', kind: 'seat', ref: SEAT_A },
      { type: 'place', kind: 'seat', ref: SEAT_A },
    );
    expect(s.elements).toHaveLength(1);
    expect(s.blocked).toEqual({ reason: 'already-placed' });
  });
  it('requires a 1 to 40 character area label', () => {
    const s = reduce(draft(), { type: 'place', kind: 'area', ref: 'n', label: '   ' });
    expect(s.elements).toHaveLength(0);
    expect(s.blocked).toEqual({ reason: 'invalid-label' });
    const long = reduce(draft(), { type: 'place', kind: 'area', ref: 'n', label: 'x'.repeat(41) });
    expect(long.elements).toHaveLength(0);
  });
  it('removing from the plan lets the same seat be placed again', () => {
    const s = run(
      draft(),
      { type: 'place', kind: 'seat', ref: SEAT_A },
      { type: 'removeFromPlan', id: `seat:${SEAT_A}` },
      { type: 'place', kind: 'seat', ref: SEAT_A },
    );
    expect(s.elements).toHaveLength(1);
  });
});

describe('move', () => {
  const picked = (s: DraftState, id: string) => run(s, { type: 'grab', id });
  it('moves the grabbed item by the delta', () => {
    const s = run(picked(withCubicle(), 'a'), { type: 'move', dx: 1, dy: 1 });
    expect(rectOf(s, 'a')).toEqual({ x: 4, y: 4, w: 2, h: 2 });
    expect(s.dirty).toBe(true);
    expect(s.blocked).toBeNull();
  });
  it('moves the selected item when nothing is grabbed', () => {
    const s = run(withCubicle(), { type: 'select', id: 'a' }, { type: 'move', dx: 1, dy: 0 });
    expect(rectOf(s, 'a').x).toBe(4);
  });
  it('is blocked at every edge and leaves the item unchanged', () => {
    const base = draft([el('s', 'seat', 0, 0, 2, 2, { seatId: SEAT_A })], 10, 10);
    const left = run(picked(base, 's'), { type: 'move', dx: -1, dy: 0 });
    expect(left.blocked).toEqual({ reason: 'edge' });
    expect(rectOf(left, 's')).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    const up = run(picked(base, 's'), { type: 'move', dx: 0, dy: -1 });
    expect(up.blocked).toEqual({ reason: 'edge' });
    const far = draft([el('s', 'seat', 8, 8, 2, 2, { seatId: SEAT_A })], 10, 10);
    expect(run(picked(far, 's'), { type: 'move', dx: 1, dy: 0 }).blocked).toEqual({
      reason: 'edge',
    });
    expect(run(picked(far, 's'), { type: 'move', dx: 0, dy: 1 }).blocked).toEqual({
      reason: 'edge',
    });
  });
  it('refuses a seat over another seat, naming it', () => {
    const base = draft([
      el('s1', 'seat', 0, 0, 2, 2, { seatId: SEAT_A, label: 'A-1' }),
      el('s2', 'seat', 3, 0, 2, 2, { seatId: SEAT_B, label: 'A-2' }),
    ]);
    const s = run(picked(base, 's1'), { type: 'move', dx: 2, dy: 0 });
    expect(s.blocked).toEqual({ reason: 'overlap', with: 'A-2' });
    expect(rectOf(s, 's1').x).toBe(0);
  });
  it('refuses cubicle over cubicle and area over area', () => {
    const cubs = draft([
      el('c1', 'cubicle', 0, 0, 3, 3, { cubicleId: CUB }),
      el('c2', 'cubicle', 4, 0, 3, 3, { cubicleId: CUB2 }),
    ]);
    expect(run(picked(cubs, 'c1'), { type: 'move', dx: 2, dy: 0 }).blocked).toMatchObject({
      reason: 'overlap',
    });
    const areas = draft([el('r1', 'area', 0, 0, 3, 3), el('r2', 'area', 4, 0, 3, 3)]);
    expect(run(picked(areas, 'r1'), { type: 'move', dx: 2, dy: 0 }).blocked).toMatchObject({
      reason: 'overlap',
    });
  });
  it('lets different kinds overlap', () => {
    const base = draft([
      el('r', 'area', 0, 0, 6, 4),
      el('s', 'seat', 8, 0, 2, 2, { seatId: SEAT_A }),
    ]);
    const s = run(picked(base, 's'), { type: 'move', dx: -7, dy: 0 });
    expect(s.blocked).toBeNull();
    expect(rectOf(s, 's').x).toBe(1);
  });
  it('carries the seats inside a grabbed cubicle', () => {
    const s = picked(withCubicle(), 'c');
    expect(s.grabbed?.carried).toEqual(['a']);
    const moved = run(s, { type: 'move', dx: 2, dy: 1 });
    expect(rectOf(moved, 'c')).toMatchObject({ x: 4, y: 3 });
    expect(rectOf(moved, 'a')).toMatchObject({ x: 5, y: 4 });
  });
  it('carries only seats assigned to that cubicle and lying inside it', () => {
    const base = draft([
      el('c', 'cubicle', 2, 2, 6, 4, { cubicleId: CUB }),
      el('in', 'seat', 3, 3, 2, 2, { seatId: SEAT_A, cubicleId: CUB }),
      el('other', 'seat', 5, 3, 2, 2, { seatId: SEAT_B, cubicleId: CUB2 }),
      el('out', 'seat', 12, 3, 2, 2, { seatId: SEAT_C, cubicleId: CUB }),
    ]);
    expect(picked(base, 'c').grabbed?.carried).toEqual(['in']);
  });
  it('blocks the whole move when a carried seat would leave the grid', () => {
    const base = draft(
      [
        el('c', 'cubicle', 0, 0, 4, 4, { cubicleId: CUB }),
        el('a', 'seat', 2, 2, 2, 2, { seatId: SEAT_A, cubicleId: CUB }),
      ],
      10,
      10,
    );
    const s = run(picked(base, 'c'), { type: 'move', dx: 6, dy: 0 });
    // the cubicle fits (right edge 10) and the seat too: allowed
    expect(s.blocked).toBeNull();
    const s2 = run(s, { type: 'move', dx: 1, dy: 0 });
    expect(s2.blocked).toEqual({ reason: 'edge' });
    expect(rectOf(s2, 'a').x).toBe(8);
  });
  it('does nothing without a grabbed or selected item', () => {
    const s = reduce(withCubicle(), { type: 'move', dx: 1, dy: 0 });
    expect(s.dirty).toBe(false);
    expect(s.elements).toEqual(withCubicle().elements);
  });
});

describe('grab, drop and cancel', () => {
  it('grab selects and records the origin', () => {
    const s = reduce(withCubicle(), { type: 'grab', id: 'a' });
    expect(s.selectedId).toBe('a');
    expect(s.grabbed).toMatchObject({ id: 'a', from: { x: 3, y: 3, w: 2, h: 2 }, carried: [] });
  });
  it('drop commits and releases', () => {
    const s = run(
      withCubicle(),
      { type: 'grab', id: 'a' },
      { type: 'move', dx: 1, dy: 0 },
      { type: 'drop' },
    );
    expect(s.grabbed).toBeNull();
    expect(rectOf(s, 'a').x).toBe(4);
    expect(s.dirty).toBe(true);
  });
  it('cancel restores the item and carried seats exactly, and is clean again', () => {
    const s = run(
      withCubicle(),
      { type: 'grab', id: 'c' },
      { type: 'move', dx: 3, dy: 2 },
      { type: 'resize', dw: 1, dh: 1 },
      { type: 'cancel' },
    );
    expect(s.grabbed).toBeNull();
    expect(s.elements).toEqual(withCubicle().elements);
    expect(s.dirty).toBe(false);
  });
  it('grab on an unknown id is ignored', () => {
    expect(reduce(withCubicle(), { type: 'grab', id: 'nope' }).grabbed).toBeNull();
  });
  it('drop and cancel without a grab are harmless', () => {
    const s = withCubicle();
    expect(reduce(s, { type: 'drop' }).elements).toEqual(s.elements);
    expect(reduce(s, { type: 'cancel' }).elements).toEqual(s.elements);
  });
});

describe('resize', () => {
  it('grows and shrinks the right and bottom edges, origin fixed', () => {
    const s = run(withCubicle(), { type: 'select', id: 'a' }, { type: 'resize', dw: 1, dh: 2 });
    expect(rectOf(s, 'a')).toEqual({ x: 3, y: 3, w: 3, h: 4 });
    const t = run(s, { type: 'resize', dw: -2, dh: -3 });
    expect(rectOf(t, 'a')).toEqual({ x: 3, y: 3, w: 1, h: 1 });
  });
  it('never goes below 1x1', () => {
    const s = run(withCubicle(), { type: 'select', id: 'a' }, { type: 'resize', dw: -2, dh: 0 });
    expect(s.blocked).toEqual({ reason: 'invalid-size' });
    expect(rectOf(s, 'a').w).toBe(2);
  });
  it('is blocked at the grid edge', () => {
    const base = draft([el('s', 'seat', 8, 0, 2, 2, { seatId: SEAT_A })], 10, 10);
    const s = run(base, { type: 'select', id: 's' }, { type: 'resize', dw: 1, dh: 0 });
    expect(s.blocked).toEqual({ reason: 'edge' });
    const t = run(base, { type: 'select', id: 's' }, { type: 'resize', dw: 0, dh: 9 });
    expect(t.blocked).toEqual({ reason: 'edge' });
  });
  it('is blocked by an overlap of the same kind', () => {
    const base = draft([
      el('s1', 'seat', 0, 0, 2, 2, { seatId: SEAT_A, label: 'A-1' }),
      el('s2', 'seat', 3, 0, 2, 2, { seatId: SEAT_B, label: 'A-2' }),
    ]);
    const s = run(base, { type: 'select', id: 's1' }, { type: 'resize', dw: 2, dh: 0 });
    expect(s.blocked).toEqual({ reason: 'overlap', with: 'A-2' });
  });
  it('does nothing without a target', () => {
    expect(reduce(withCubicle(), { type: 'resize', dw: 1, dh: 1 }).dirty).toBe(false);
  });
});

describe('setRect', () => {
  it('sets a valid rectangle', () => {
    const s = reduce(withCubicle(), { type: 'setRect', id: 'a', rect: { x: 4, y: 3, w: 1, h: 1 } });
    expect(rectOf(s, 'a')).toEqual({ x: 4, y: 3, w: 1, h: 1 });
    expect(s.dirty).toBe(true);
  });
  it.each([
    [{ x: -1, y: 0, w: 2, h: 2 }, 'edge'],
    [{ x: 19, y: 0, w: 2, h: 2 }, 'edge'],
    [{ x: 0, y: 11, w: 2, h: 2 }, 'edge'],
    [{ x: 0, y: 0, w: 0, h: 2 }, 'invalid-size'],
    [{ x: 0, y: 0, w: 2, h: 0 }, 'invalid-size'],
    [{ x: 0.5, y: 0, w: 2, h: 2 }, 'invalid-size'],
  ])('refuses %j as %s', (rect, reason) => {
    const s = reduce(withCubicle(), { type: 'setRect', id: 'a', rect });
    expect(s.blocked).toEqual({ reason });
    expect(rectOf(s, 'a')).toEqual({ x: 3, y: 3, w: 2, h: 2 });
  });
  it('refuses an overlap and an unknown id', () => {
    const base = draft([
      el('s1', 'seat', 0, 0, 2, 2, { seatId: SEAT_A, label: 'A-1' }),
      el('s2', 'seat', 3, 0, 2, 2, { seatId: SEAT_B, label: 'A-2' }),
    ]);
    expect(
      reduce(base, { type: 'setRect', id: 's1', rect: { x: 2, y: 0, w: 2, h: 2 } }).blocked,
    ).toEqual({
      reason: 'overlap',
      with: 'A-2',
    });
    expect(
      reduce(base, { type: 'setRect', id: 'x', rect: { x: 0, y: 0, w: 1, h: 1 } }).blocked,
    ).toEqual({
      reason: 'unknown-item',
    });
  });
  it('a successful action clears an earlier blocked reason', () => {
    const s = run(
      withCubicle(),
      { type: 'setRect', id: 'a', rect: { x: -1, y: 0, w: 1, h: 1 } },
      { type: 'setRect', id: 'a', rect: { x: 3, y: 3, w: 1, h: 1 } },
    );
    expect(s.blocked).toBeNull();
  });
});

describe('renameArea', () => {
  const base = () =>
    draft([
      el('r', 'area', 0, 0, 4, 4, { label: 'Kitchen' }),
      el('s', 'seat', 8, 0, 2, 2, { seatId: SEAT_A }),
    ]);
  it('trims and stores the label', () => {
    const s = reduce(base(), { type: 'renameArea', id: 'r', label: '  Lobby ' });
    expect(s.elements[0]?.label).toBe('Lobby');
    expect(s.dirty).toBe(true);
  });
  it('rejects empty and over-long labels', () => {
    expect(reduce(base(), { type: 'renameArea', id: 'r', label: '  ' }).blocked).toEqual({
      reason: 'invalid-label',
    });
    expect(
      reduce(base(), { type: 'renameArea', id: 'r', label: 'x'.repeat(41) }).elements[0]?.label,
    ).toBe('Kitchen');
    expect(
      reduce(base(), { type: 'renameArea', id: 'r', label: 'x'.repeat(40) }).blocked,
    ).toBeNull();
  });
  it('is only for areas', () => {
    expect(reduce(base(), { type: 'renameArea', id: 's', label: 'zz' }).blocked).toEqual({
      reason: 'unknown-item',
    });
  });
});

describe('removeFromPlan and deleteArea', () => {
  it('removes a seat and clears the selection', () => {
    const s = run(withCubicle(), { type: 'select', id: 'a' }, { type: 'removeFromPlan', id: 'a' });
    expect(s.elements.map((e) => e.id)).toEqual(['c']);
    expect(s.selectedId).toBeNull();
    expect(s.dirty).toBe(true);
  });
  it('removing a cubicle leaves its seats placed', () => {
    const s = reduce(withCubicle(), { type: 'removeFromPlan', id: 'c' });
    expect(s.elements.map((e) => e.id)).toEqual(['a']);
  });
  it('keeps an unrelated selection and drops a grab of the removed item', () => {
    const s = run(withCubicle(), { type: 'grab', id: 'a' }, { type: 'removeFromPlan', id: 'a' });
    expect(s.grabbed).toBeNull();
    const t = run(withCubicle(), { type: 'select', id: 'c' }, { type: 'removeFromPlan', id: 'a' });
    expect(t.selectedId).toBe('c');
  });
  it('deleteArea removes only areas', () => {
    const base = draft([
      el('r', 'area', 0, 0, 4, 4),
      el('s', 'seat', 8, 0, 2, 2, { seatId: SEAT_A }),
    ]);
    expect(reduce(base, { type: 'deleteArea', id: 'r' }).elements.map((e) => e.id)).toEqual(['s']);
    expect(reduce(base, { type: 'deleteArea', id: 's' }).blocked).toEqual({
      reason: 'unknown-item',
    });
  });
  it('removing an unknown id is refused', () => {
    expect(reduce(withCubicle(), { type: 'removeFromPlan', id: 'q' }).blocked).toEqual({
      reason: 'unknown-item',
    });
  });
});

describe('setGrid', () => {
  it('changes the grid', () => {
    const s = reduce(withCubicle(), { type: 'setGrid', columns: 30, rows: 15 });
    expect(s).toMatchObject({ columns: 30, rows: 15, dirty: true, blocked: null });
  });
  it.each([
    [9, 12],
    [81, 12],
    [20, 9],
    [20, 81],
    [12.5, 12],
  ])('refuses %i x %i', (columns, rows) => {
    const s = reduce(withCubicle(), { type: 'setGrid', columns, rows });
    expect(s.blocked).toEqual({ reason: 'invalid-grid' });
    expect(s.columns).toBe(20);
  });
  it('accepts the limits 10 and 80', () => {
    expect(reduce(draft(), { type: 'setGrid', columns: 10, rows: 10 }).blocked).toBeNull();
    expect(reduce(draft(), { type: 'setGrid', columns: 80, rows: 80 }).blocked).toBeNull();
  });
  it('refuses a shrink that cuts an item, naming the first cut column', () => {
    const s = reduce(withCubicle(), { type: 'setGrid', columns: 10, rows: 10 });
    expect(s.blocked).toBeNull();
    const cut = reduce(draft([el('s', 'seat', 9, 0, 2, 2, { seatId: SEAT_A })]), {
      type: 'setGrid',
      columns: 10,
      rows: 10,
    });
    expect(cut.blocked).toEqual({ reason: 'items-outside', axis: 'column', index: 10 });
    expect(cut.columns).toBe(20);
  });
  it('names the cut row when only rows are cut', () => {
    const s = reduce(draft([el('s', 'seat', 0, 9, 2, 2, { seatId: SEAT_A })]), {
      type: 'setGrid',
      columns: 20,
      rows: 10,
    });
    expect(s.blocked).toEqual({ reason: 'items-outside', axis: 'row', index: 10 });
  });
  it('picks the earliest cut column across items', () => {
    const s = reduce(
      draft([
        el('s', 'seat', 14, 0, 2, 2, { seatId: SEAT_A }),
        el('t', 'seat', 12, 0, 2, 2, { seatId: SEAT_B }),
      ]),
      { type: 'setGrid', columns: 12, rows: 12 },
    );
    expect(s.blocked).toEqual({ reason: 'items-outside', axis: 'column', index: 12 });
  });
});

describe('dirty tracking', () => {
  it('returns to clean when the draft matches the loaded layout again', () => {
    const s = run(withCubicle(), { type: 'select', id: 'a' }, { type: 'move', dx: 1, dy: 0 });
    expect(s.dirty).toBe(true);
    expect(reduce(s, { type: 'move', dx: -1, dy: 0 }).dirty).toBe(false);
  });
});

describe('validate', () => {
  it('reports an empty plan', () => {
    expect(validate(draft()).map((p) => p.code)).toEqual(['empty']);
  });
  it('is clean for a valid plan', () => {
    expect(validate(withCubicle())).toEqual([]);
  });
  it('reports a seat outside its cubicle, naming both', () => {
    const s = draft([
      el('c', 'cubicle', 2, 2, 6, 4, { cubicleId: CUB, label: 'Pod 1' }),
      el('a', 'seat', 10, 3, 2, 2, { seatId: SEAT_A, cubicleId: CUB, label: 'A-1' }),
    ]);
    const problems = validate(s);
    expect(problems).toEqual([
      { code: 'seat-outside-cubicle', id: 'a', message: 'Seat A-1 is outside cubicle Pod 1' },
    ]);
    expect(isSeatOutsideCubicle(s, 'a')).toBe(true);
  });
  it('treats partly outside as outside, exact fit as inside', () => {
    const fit = draft([
      el('c', 'cubicle', 2, 2, 4, 4, { cubicleId: CUB }),
      el('a', 'seat', 4, 4, 2, 2, { seatId: SEAT_A, cubicleId: CUB }),
    ]);
    expect(isSeatOutsideCubicle(fit, 'a')).toBe(false);
    const part = draft([
      el('c', 'cubicle', 2, 2, 4, 4, { cubicleId: CUB }),
      el('a', 'seat', 5, 4, 2, 2, { seatId: SEAT_A, cubicleId: CUB }),
    ]);
    expect(isSeatOutsideCubicle(part, 'a')).toBe(true);
  });
  it('ignores a cubicle that is not on the plan and seats without one', () => {
    const s = draft([
      el('a', 'seat', 10, 3, 2, 2, { seatId: SEAT_A, cubicleId: CUB }),
      el('b', 'seat', 0, 0, 2, 2, { seatId: SEAT_B }),
    ]);
    expect(validate(s)).toEqual([]);
    expect(isSeatOutsideCubicle(s, 'a')).toBe(false);
    expect(isSeatOutsideCubicle(s, 'b')).toBe(false);
    expect(isSeatOutsideCubicle(s, 'missing')).toBe(false);
  });
  it('reports elements outside the grid (stale data), without throwing', () => {
    const s = draft([el('r', 'area', 18, 0, 6, 4, { label: 'Kitchen' })]);
    expect(validate(s)).toEqual([
      { code: 'outside-grid', id: 'r', message: 'Area Kitchen is outside the grid' },
    ]);
  });
  it('reports moving a cubicle away from its seat', () => {
    const s = run(withCubicle(), { type: 'select', id: 'c' }, { type: 'move', dx: 5, dy: 0 });
    expect(validate(s).map((p) => p.code)).toEqual(['seat-outside-cubicle']);
  });
});

describe('toSaveInput', () => {
  it('produces the generated PUT input, sorted by y, x, kind, id', () => {
    const s = draft([
      el('z', 'area', 6, 0, 4, 2, { label: 'Kitchen' }),
      el('a', 'seat', 3, 3, 2, 2, { seatId: SEAT_A, cubicleId: CUB, label: 'A-1' }),
      el('c', 'cubicle', 2, 2, 6, 4, { cubicleId: CUB, label: 'Pod' }),
      el('b', 'seat', 0, 0, 2, 2, { seatId: SEAT_B, label: 'A-2' }),
    ]);
    expect(toSaveInput(s)).toEqual({
      version: 3,
      columns: 20,
      rows: 12,
      elements: [
        { kind: 'seat', seatId: SEAT_B, x: 0, y: 0, w: 2, h: 2 },
        { kind: 'area', label: 'Kitchen', x: 6, y: 0, w: 4, h: 2 },
        { kind: 'cubicle', cubicleId: CUB, x: 2, y: 2, w: 6, h: 4 },
        { kind: 'seat', seatId: SEAT_A, cubicleId: CUB, x: 3, y: 3, w: 2, h: 2 },
      ],
    });
  });
  it('breaks ties on kind then id', () => {
    const s = draft([
      el('r2', 'area', 0, 0, 2, 2, { label: 'B' }),
      el('r1', 'area', 0, 0, 2, 2, { label: 'A' }),
      el('s', 'seat', 0, 0, 2, 2, { seatId: SEAT_A }),
    ]);
    expect(toSaveInput(s).elements.map((e) => e.label ?? e.kind)).toEqual(['A', 'B', 'seat']);
  });
  it('is stable regardless of element order', () => {
    const els = [
      el('a', 'seat', 0, 0, 2, 2, { seatId: SEAT_A }),
      el('b', 'seat', 4, 0, 2, 2, { seatId: SEAT_B }),
    ];
    expect(toSaveInput(draft(els))).toEqual(toSaveInput(draft([...els].reverse())));
  });
  it('caps nothing itself but is rejected by validate over 600 elements', () => {
    const many = Array.from({ length: 601 }, (_, i) =>
      el(`s${i}`, 'seat', i % 80, Math.floor(i / 80), 1, 1, { seatId: SEAT_A }),
    );
    expect(validate(draft(many, 80, 80)).map((p) => p.code)).toContain('too-many');
  });
});

describe('keyboard helpers', () => {
  const els = [
    { ...el('b', 'seat', 4, 0, 2, 2, { seatId: SEAT_B }) },
    { ...el('a', 'seat', 0, 0, 2, 2, { seatId: SEAT_A }) },
    { ...el('c', 'seat', 0, 4, 2, 2, { seatId: SEAT_C }) },
  ].map((e) => ({ ...e, seatId: e.seatId ?? undefined, cubicleId: undefined }));
  it('orders items top to bottom, left to right, then id', () => {
    expect(readingOrder(els).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
  it('finds the nearest item in a direction', () => {
    expect(neighbour(els, 'a', 'right')).toBe('b');
    expect(neighbour(els, 'a', 'down')).toBe('c');
    expect(neighbour(els, 'b', 'left')).toBe('a');
    expect(neighbour(els, 'c', 'up')).toBe('a');
  });
  it('returns null when nothing lies that way or the id is unknown', () => {
    expect(neighbour(els, 'a', 'left')).toBeNull();
    expect(neighbour(els, 'a', 'up')).toBeNull();
    expect(neighbour(els, 'zz', 'up')).toBeNull();
  });
  it('stays inside a 90 degree cone', () => {
    const diag = [...els, { id: 'd', kind: 'seat' as const, label: 'd', x: 40, y: 1, w: 2, h: 2 }];
    expect(neighbour(diag, 'c', 'right')).toBeNull();
    expect(neighbour(diag, 'a', 'right')).toBe('b');
  });
});
