import { describe, expect, it } from 'vitest';

import { describeChange } from './messages';
import { type Action, createDraft, type DraftState, reduce } from './model';

const C = '44444444-4444-4444-8444-444444444444';
const el = (
  id: string,
  kind: 'seat' | 'cubicle' | 'area',
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  cubicleId: string | null = null,
) => ({ id, kind, seatId: kind === 'seat' ? id : null, cubicleId, label, x, y, w, h });
const start = (): DraftState =>
  createDraft({
    columns: 12,
    rows: 10,
    version: 1,
    elements: [
      el('a', 'seat', 2, 3, 2, 2, 'A-1', C),
      el('b', 'seat', 5, 3, 2, 2, 'A-2'),
      el('c', 'cubicle', 1, 2, 5, 4, 'Pod 1', C),
      el('k', 'area', 8, 0, 3, 2, 'Kitchen'),
    ],
    unplacedSeatIds: [],
  });
const labelOf = (e: { label: string }) => e.label;
const step = (before: DraftState, action: Action) => {
  const after = reduce(before, action);
  return { after, text: describeChange(before, after, action, labelOf) };
};

describe('describeChange', () => {
  it('announces select', () => {
    expect(step(start(), { type: 'select', id: 'a' }).text).toBe('Selected seat A-1.');
  });
  it('announces pick up with the instructions', () => {
    expect(step(start(), { type: 'grab', id: 'a' }).text).toBe(
      'Picked up seat A-1 at column 3, row 4. Arrow keys move it. Shift and arrow keys resize it. Space drops it. Escape cancels.',
    );
  });
  it('announces a move to the new column and row', () => {
    const g = step(start(), { type: 'grab', id: 'k' }).after;
    expect(step(g, { type: 'move', dx: 0, dy: 1 }).text).toBe(
      'Area Kitchen moved to column 9, row 2.',
    );
  });
  it('announces a blocked edge move with its direction', () => {
    const g = step(start(), { type: 'grab', id: 'k' }).after;
    expect(step(g, { type: 'move', dx: 0, dy: -1 }).text).toBe(
      "Area Kitchen can't move up. It is at the edge of the grid.",
    );
    expect(step(g, { type: 'move', dx: 2, dy: 0 }).text).toBe(
      "Area Kitchen can't move right. It is at the edge of the grid.",
    );
  });
  it('announces a blocked overlap naming the other item', () => {
    const g = step(start(), { type: 'grab', id: 'a' }).after;
    expect(step(g, { type: 'move', dx: 2, dy: 0 }).text).toBe(
      "Seat A-1 can't go there. Seat A-2 is in the way.",
    );
  });
  it('announces a resize', () => {
    const g = step(start(), { type: 'grab', id: 'a' }).after;
    expect(step(g, { type: 'resize', dw: 1, dh: 0 }).text).toBe(
      'Seat A-1 is now 3 squares wide and 2 high.',
    );
    expect(step(g, { type: 'resize', dw: -1, dh: 0 }).text).toBe(
      'Seat A-1 is now 1 square wide and 2 high.',
    );
  });
  it('announces containment broken and restored', () => {
    let s = step(start(), { type: 'grab', id: 'a' }).after;
    s = step(s, { type: 'move', dx: 0, dy: 1 }).after;
    const out = step(s, { type: 'move', dx: 0, dy: 1 });
    expect(out.text).toBe('Seat A-1 moved to column 3, row 6. Seat A-1 is outside cubicle Pod 1.');
    expect(step(out.after, { type: 'move', dx: 0, dy: -1 }).text).toBe(
      'Seat A-1 moved to column 3, row 5. Seat A-1 is inside cubicle Pod 1 again.',
    );
  });
  it('announces drop and cancel', () => {
    const g = step(start(), { type: 'grab', id: 'a' }).after;
    const moved = step(g, { type: 'move', dx: 1, dy: 0 }).after;
    expect(step(moved, { type: 'drop' }).text).toBe('Dropped seat A-1 at column 4, row 4.');
    expect(step(moved, { type: 'cancel' }).text).toBe(
      'Move cancelled. Seat A-1 is back at column 3, row 4.',
    );
  });
  it('announces place, and no free space', () => {
    const empty = createDraft({
      columns: 10,
      rows: 10,
      version: 0,
      elements: [],
      unplacedSeatIds: [],
    });
    const placed = step(empty, { type: 'place', kind: 'seat', ref: 's1', label: 'B-1' });
    expect(placed.text).toBe('Seat B-1 placed at column 1, row 1. Press space to pick it up.');
    const full = createDraft({
      columns: 10,
      rows: 10,
      version: 0,
      elements: [el('big', 'seat', 0, 0, 10, 10, 'Big')],
      unplacedSeatIds: [],
    });
    expect(step(full, { type: 'place', kind: 'seat', ref: 's2', label: 'x' }).text).toBe(
      'There is no free space for another seat on the grid.',
    );
  });
  it('announces removal from the plan and area deletion', () => {
    expect(step(start(), { type: 'removeFromPlan', id: 'b' }).text).toBe(
      'Seat A-2 removed from the plan.',
    );
    expect(step(start(), { type: 'removeFromPlan', id: 'k' }).text).toBe('Area Kitchen deleted.');
    expect(step(start(), { type: 'deleteArea', id: 'k' }).text).toBe('Area Kitchen deleted.');
  });
  it('says nothing for actions without a message', () => {
    expect(step(start(), { type: 'clear' }).text).toBeNull();
    expect(step(start(), { type: 'drop' }).text).toBeNull();
  });
});
