import { describe, expect, it } from 'vitest';

import { createDraft, reduce, type DraftState } from './model';
import { planKey } from './keys';

const seat = (id: string, x: number, y: number) => ({
  id,
  kind: 'seat' as const,
  seatId: id,
  cubicleId: null,
  label: id,
  x,
  y,
  w: 2,
  h: 2,
});
const base = (): DraftState =>
  createDraft({
    columns: 20,
    rows: 12,
    version: 1,
    elements: [seat('a', 0, 0), seat('b', 4, 0), seat('c', 0, 4)],
    unplacedSeatIds: [],
  });
const key = (key: string, shiftKey = false) => ({ key, shiftKey });
const grabbed = () => reduce(base(), { type: 'grab', id: 'a' });

describe('planKey, nothing picked up', () => {
  it('arrows travel focus to the nearest item', () => {
    expect(planKey(base(), 'a', key('ArrowRight'))).toMatchObject({
      focusId: 'b',
      preventDefault: true,
      actions: [],
    });
    expect(planKey(base(), 'a', key('ArrowDown'))).toMatchObject({ focusId: 'c' });
  });
  it('says when there is no item that way', () => {
    const r = planKey(base(), 'a', key('ArrowLeft'));
    expect(r.message).toBe('No item to the left.');
    expect(r.focusId).toBeUndefined();
    expect(r.preventDefault).toBe(true);
  });
  it('Home and End jump to the first and last item in reading order', () => {
    expect(planKey(base(), 'b', key('Home')).focusId).toBe('a');
    expect(planKey(base(), 'a', key('End')).focusId).toBe('c');
  });
  it('Enter selects and asks for the name field', () => {
    expect(planKey(base(), 'b', key('Enter'))).toMatchObject({
      actions: [{ type: 'select', id: 'b' }],
      editName: true,
      preventDefault: true,
    });
  });
  it('Space picks the item up', () => {
    expect(planKey(base(), 'b', key(' ')).actions).toEqual([{ type: 'grab', id: 'b' }]);
  });
  it('Delete and Backspace remove it and move focus to a neighbour', () => {
    const r = planKey(base(), 'a', key('Delete'));
    expect(r.actions).toEqual([{ type: 'removeFromPlan', id: 'a' }]);
    expect(r.focusId).toBe('b');
    expect(planKey(base(), 'a', key('Backspace')).actions).toEqual([
      { type: 'removeFromPlan', id: 'a' },
    ]);
  });
  it('removing the only item sends focus to the plan region', () => {
    const one = createDraft({
      columns: 20,
      rows: 12,
      version: 1,
      elements: [seat('a', 0, 0)],
      unplacedSeatIds: [],
    });
    expect(planKey(one, 'a', key('Delete')).focusId).toBeNull();
  });
  it('Escape clears the selection; other keys are left alone', () => {
    expect(planKey(base(), 'a', key('Escape')).actions).toEqual([{ type: 'clear' }]);
    expect(planKey(base(), 'a', key('x'))).toEqual({ actions: [], preventDefault: false });
    expect(planKey(base(), 'a', key('Tab'))).toEqual({ actions: [], preventDefault: false });
  });
});

describe('planKey, item picked up', () => {
  it('arrows move by one square', () => {
    expect(planKey(grabbed(), 'a', key('ArrowRight')).actions).toEqual([
      { type: 'move', dx: 1, dy: 0 },
    ]);
    expect(planKey(grabbed(), 'a', key('ArrowLeft')).actions).toEqual([
      { type: 'move', dx: -1, dy: 0 },
    ]);
    expect(planKey(grabbed(), 'a', key('ArrowUp')).actions).toEqual([
      { type: 'move', dx: 0, dy: -1 },
    ]);
    expect(planKey(grabbed(), 'a', key('ArrowDown')).actions).toEqual([
      { type: 'move', dx: 0, dy: 1 },
    ]);
  });
  it('Shift and arrows resize right and bottom edges', () => {
    expect(planKey(grabbed(), 'a', key('ArrowRight', true)).actions).toEqual([
      { type: 'resize', dw: 1, dh: 0 },
    ]);
    expect(planKey(grabbed(), 'a', key('ArrowLeft', true)).actions).toEqual([
      { type: 'resize', dw: -1, dh: 0 },
    ]);
    expect(planKey(grabbed(), 'a', key('ArrowDown', true)).actions).toEqual([
      { type: 'resize', dw: 0, dh: 1 },
    ]);
    expect(planKey(grabbed(), 'a', key('ArrowUp', true)).actions).toEqual([
      { type: 'resize', dw: 0, dh: -1 },
    ]);
  });
  it('Space and Enter drop, Escape cancels', () => {
    expect(planKey(grabbed(), 'a', key(' ')).actions).toEqual([{ type: 'drop' }]);
    expect(planKey(grabbed(), 'a', key('Enter')).actions).toEqual([{ type: 'drop' }]);
    expect(planKey(grabbed(), 'a', key('Escape')).actions).toEqual([{ type: 'cancel' }]);
  });
  it('Tab drops the item but lets focus leave', () => {
    expect(planKey(grabbed(), 'a', key('Tab'))).toEqual({
      actions: [{ type: 'drop' }],
      preventDefault: false,
    });
  });
  it('ignores Delete while picked up', () => {
    expect(planKey(grabbed(), 'a', key('Delete'))).toEqual({ actions: [], preventDefault: false });
  });
});
