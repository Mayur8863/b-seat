import type { OwnerLayout, SaveLayoutInput } from '@bseat/api-client';

export type Kind = 'seat' | 'cubicle' | 'area';
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Direction = 'up' | 'down' | 'left' | 'right';
export interface LayoutElementDraft extends Rect {
  id: string;
  kind: Kind;
  seatId?: string;
  cubicleId?: string;
  label: string;
}
export type Blocked =
  | {
      reason:
        'edge' | 'no-space' | 'invalid-size' | 'already-placed' | 'invalid-label' | 'unknown-item';
    }
  | { reason: 'overlap'; with: string }
  | { reason: 'items-outside'; axis: 'column' | 'row'; index: number }
  | { reason: 'invalid-grid' };
export interface Grabbed {
  id: string;
  from: Rect;
  carried: string[];
  origins: Record<string, Rect>;
}
export interface DraftState {
  columns: number;
  rows: number;
  version: number;
  elements: LayoutElementDraft[];
  selectedId: string | null;
  grabbed: Grabbed | null;
  dirty: boolean;
  baseline: string;
  blocked: Blocked | null;
}
export type Action =
  | { type: 'select'; id: string }
  | { type: 'clear' }
  | { type: 'place'; kind: Kind; ref: string; label?: string; cubicleId?: string }
  | { type: 'grab'; id: string }
  | { type: 'drop' }
  | { type: 'cancel' }
  | { type: 'move'; dx: number; dy: number }
  | { type: 'resize'; dw: number; dh: number }
  | { type: 'setRect'; id: string; rect: Rect }
  | { type: 'renameArea'; id: string; label: string }
  | { type: 'removeFromPlan'; id: string }
  | { type: 'deleteArea'; id: string }
  | { type: 'setGrid'; columns: number; rows: number }
  | { type: 'setCubicle'; id: string; cubicleId: string | null }
  | { type: 'forget'; id: string };
export interface Problem {
  code: 'seat-outside-cubicle' | 'outside-grid' | 'empty' | 'too-many';
  id?: string;
  message: string;
}

const DEFAULT_SIZE: Record<Kind, { w: number; h: number }> = {
  seat: { w: 2, h: 2 },
  cubicle: { w: 6, h: 4 },
  area: { w: 6, h: 4 },
};
const MAX_ELEMENTS = 600;
const GRID_MIN = 10;
const GRID_MAX = 80;
const LABEL_MAX = 40;

const rectOf = ({ x, y, w, h }: Rect): Rect => ({ x, y, w, h });
const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (inner: Rect, outer: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;
const withinGrid = (r: Rect, columns: number, rows: number) =>
  r.x >= 0 && r.y >= 0 && r.x + r.w <= columns && r.y + r.h <= rows;
const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const byPosition = (a: LayoutElementDraft, b: LayoutElementDraft) => a.y - b.y || a.x - b.x;

// Dirty tracking compares geometry and labels with the loaded layout, so undoing a change is clean again.
function snapshot(columns: number, rows: number, elements: LayoutElementDraft[]): string {
  const items = [...elements]
    .sort((a, b) => compareText(a.id, b.id))
    .map((e) => [e.id, e.cubicleId ?? '', e.label, e.x, e.y, e.w, e.h]);
  return JSON.stringify([columns, rows, items]);
}

function withElements(
  state: DraftState,
  elements: LayoutElementDraft[],
  patch: Partial<DraftState> = {},
): DraftState {
  const next = { ...state, ...patch, elements, blocked: null };
  return { ...next, dirty: snapshot(next.columns, next.rows, elements) !== state.baseline };
}
const refuse = (state: DraftState, blocked: Blocked): DraftState => ({ ...state, blocked });

export function createDraft(layout: OwnerLayout): DraftState {
  const elements = layout.elements.map<LayoutElementDraft>((e) => ({
    id: e.id,
    kind: e.kind,
    ...(e.seatId ? { seatId: e.seatId } : {}),
    ...(e.cubicleId ? { cubicleId: e.cubicleId } : {}),
    label: e.label,
    x: e.x,
    y: e.y,
    w: e.w,
    h: e.h,
  }));
  return {
    columns: layout.columns,
    rows: layout.rows,
    version: layout.version,
    elements,
    selectedId: null,
    grabbed: null,
    dirty: false,
    baseline: snapshot(layout.columns, layout.rows, elements),
    blocked: null,
  };
}

function findOverlap(state: DraftState, moved: LayoutElementDraft[]): string | null {
  const movedIds = new Set(moved.map((m) => m.id));
  for (const m of moved) {
    const other = state.elements.find(
      (e) => !movedIds.has(e.id) && e.kind === m.kind && intersects(e, m),
    );
    if (other) return other.label;
  }
  return null;
}

// Applies new rectangles to elements; checks grid edges first, then same-kind overlaps.
function applyRects(state: DraftState, rects: Map<string, Rect>): DraftState {
  const moved: LayoutElementDraft[] = [];
  for (const e of state.elements) {
    const r = rects.get(e.id);
    if (r) moved.push({ ...e, ...r });
  }
  if (moved.some((m) => !withinGrid(m, state.columns, state.rows)))
    return refuse(state, { reason: 'edge' });
  const clash = findOverlap(state, moved);
  if (clash !== null) return refuse(state, { reason: 'overlap', with: clash });
  return withElements(
    state,
    state.elements.map((e) => {
      const r = rects.get(e.id);
      return r ? { ...e, ...r } : e;
    }),
  );
}

const find = (state: DraftState, id: string) => state.elements.find((e) => e.id === id);

function firstFree(state: DraftState, kind: Kind): Rect | null {
  const { w, h } = DEFAULT_SIZE[kind];
  const same = state.elements.filter((e) => e.kind === kind);
  for (let y = 0; y + h <= state.rows; y++) {
    for (let x = 0; x + w <= state.columns; x++) {
      const candidate = { x, y, w, h };
      if (!same.some((e) => intersects(e, candidate))) return candidate;
    }
  }
  return null;
}

const validLabel = (label: string) => label.length >= 1 && label.length <= LABEL_MAX;

function place(state: DraftState, a: Extract<Action, { type: 'place' }>): DraftState {
  const id = `${a.kind}:${a.ref}`;
  const taken = state.elements.some(
    (e) =>
      e.id === id ||
      (a.kind === 'seat' && e.seatId === a.ref) ||
      (a.kind === 'cubicle' && e.cubicleId === a.ref),
  );
  if (taken) return refuse(state, { reason: 'already-placed' });
  const label = (a.label ?? '').trim();
  if (a.kind === 'area' && !validLabel(label)) return refuse(state, { reason: 'invalid-label' });
  const rect = firstFree(state, a.kind);
  if (!rect) return refuse(state, { reason: 'no-space' });
  const element: LayoutElementDraft = {
    id,
    kind: a.kind,
    ...(a.kind === 'seat' ? { seatId: a.ref } : {}),
    ...(a.kind === 'cubicle'
      ? { cubicleId: a.ref }
      : a.cubicleId
        ? { cubicleId: a.cubicleId }
        : {}),
    label,
    ...rect,
  };
  return withElements(state, [...state.elements, element], { selectedId: id });
}

function grab(state: DraftState, id: string): DraftState {
  const target = find(state, id);
  if (!target) return state;
  const carried =
    target.kind === 'cubicle' && target.cubicleId
      ? state.elements
          .filter((e) => e.kind === 'seat' && e.cubicleId === target.cubicleId && inside(e, target))
          .map((e) => e.id)
      : [];
  const origins: Record<string, Rect> = {};
  for (const e of state.elements)
    if (e.id === id || carried.includes(e.id)) origins[e.id] = rectOf(e);
  return {
    ...state,
    blocked: null,
    selectedId: id,
    grabbed: { id, from: rectOf(target), carried, origins },
  };
}

function cancel(state: DraftState): DraftState {
  const g = state.grabbed;
  if (!g) return state;
  const elements = state.elements.map((e) => {
    const o = g.origins[e.id];
    return o ? { ...e, ...o } : e;
  });
  return withElements(state, elements, { grabbed: null });
}

const target = (state: DraftState) => state.grabbed?.id ?? state.selectedId;

function move(state: DraftState, dx: number, dy: number): DraftState {
  const id = target(state);
  const item = id ? find(state, id) : undefined;
  if (!item) return state;
  const ids = [item.id, ...(state.grabbed?.id === item.id ? state.grabbed.carried : [])];
  const rects = new Map<string, Rect>();
  for (const e of state.elements)
    if (ids.includes(e.id)) rects.set(e.id, { ...rectOf(e), x: e.x + dx, y: e.y + dy });
  return applyRects(state, rects);
}

function setRect(state: DraftState, id: string, rect: Rect): DraftState {
  if (!find(state, id)) return refuse(state, { reason: 'unknown-item' });
  const sane =
    [rect.x, rect.y, rect.w, rect.h].every(Number.isInteger) && rect.w >= 1 && rect.h >= 1;
  if (!sane) return refuse(state, { reason: 'invalid-size' });
  return applyRects(state, new Map([[id, rect]]));
}

function resize(state: DraftState, dw: number, dh: number): DraftState {
  const id = target(state);
  const item = id ? find(state, id) : undefined;
  if (!item) return state;
  return setRect(state, item.id, { ...rectOf(item), w: item.w + dw, h: item.h + dh });
}

function remove(state: DraftState, id: string, onlyArea: boolean): DraftState {
  const item = find(state, id);
  if (!item || (onlyArea && item.kind !== 'area')) return refuse(state, { reason: 'unknown-item' });
  return withElements(
    state,
    state.elements.filter((e) => e.id !== id),
    {
      selectedId: state.selectedId === id ? null : state.selectedId,
      grabbed: state.grabbed?.id === id ? null : state.grabbed,
    },
  );
}

function setGrid(state: DraftState, columns: number, rows: number): DraftState {
  const ok = (n: number) => Number.isInteger(n) && n >= GRID_MIN && n <= GRID_MAX;
  if (!ok(columns) || !ok(rows)) return refuse(state, { reason: 'invalid-grid' });
  if (state.elements.some((e) => e.x + e.w > columns)) {
    return refuse(state, { reason: 'items-outside', axis: 'column', index: columns });
  }
  if (state.elements.some((e) => e.y + e.h > rows)) {
    return refuse(state, { reason: 'items-outside', axis: 'row', index: rows });
  }
  return withElements(state, state.elements, { columns, rows });
}

export function reduce(state: DraftState, action: Action): DraftState {
  switch (action.type) {
    case 'select':
      return find(state, action.id) ? { ...state, blocked: null, selectedId: action.id } : state;
    case 'clear':
      return { ...state, blocked: null, selectedId: null };
    case 'place':
      return place(state, action);
    case 'grab':
      return grab(state, action.id);
    case 'drop':
      return { ...state, blocked: null, grabbed: null };
    case 'cancel':
      return cancel(state);
    case 'move':
      return move(state, action.dx, action.dy);
    case 'resize':
      return resize(state, action.dw, action.dh);
    case 'setRect':
      return setRect(state, action.id, action.rect);
    case 'renameArea': {
      const item = find(state, action.id);
      if (item?.kind !== 'area') return refuse(state, { reason: 'unknown-item' });
      const label = action.label.trim();
      if (!validLabel(label)) return refuse(state, { reason: 'invalid-label' });
      return withElements(
        state,
        state.elements.map((e) => (e.id === action.id ? { ...e, label } : e)),
      );
    }
    case 'removeFromPlan':
      return remove(state, action.id, false);
    case 'deleteArea':
      return remove(state, action.id, true);
    case 'setGrid':
      return setGrid(state, action.columns, action.rows);
    case 'setCubicle':
    case 'forget':
      return state;
  }
}

export function readingOrder(elements: LayoutElementDraft[]): LayoutElementDraft[] {
  return [...elements].sort((a, b) => byPosition(a, b) || compareText(a.id, b.id));
}

function cubicleOf(state: DraftState, seat: LayoutElementDraft): LayoutElementDraft | undefined {
  if (seat.kind !== 'seat' || !seat.cubicleId) return undefined;
  return state.elements.find((e) => e.kind === 'cubicle' && e.cubicleId === seat.cubicleId);
}

export function isSeatOutsideCubicle(state: DraftState, id: string): boolean {
  const seat = find(state, id);
  const cubicle = seat ? cubicleOf(state, seat) : undefined;
  return seat !== undefined && cubicle !== undefined && !inside(seat, cubicle);
}

const kindName = (k: Kind) => k.charAt(0).toUpperCase() + k.slice(1);

export function validate(state: DraftState): Problem[] {
  if (state.elements.length === 0) {
    return [{ code: 'empty', message: 'Place at least one seat on the plan, then save' }];
  }
  const problems: Problem[] = [];
  if (state.elements.length > MAX_ELEMENTS) {
    problems.push({
      code: 'too-many',
      message: `Keep at most ${String(MAX_ELEMENTS)} items on the plan`,
    });
  }
  for (const e of readingOrder(state.elements)) {
    if (!withinGrid(e, state.columns, state.rows)) {
      problems.push({
        code: 'outside-grid',
        id: e.id,
        message: `${kindName(e.kind)} ${e.label} is outside the grid`,
      });
    }
    const cubicle = cubicleOf(state, e);
    if (cubicle && !inside(e, cubicle)) {
      problems.push({
        code: 'seat-outside-cubicle',
        id: e.id,
        message: `Seat ${e.label} is outside cubicle ${cubicle.label}`,
      });
    }
  }
  return problems;
}

export function toSaveInput(state: DraftState): SaveLayoutInput {
  const elements = [...state.elements]
    .sort((a, b) => byPosition(a, b) || compareText(a.kind, b.kind) || compareText(a.id, b.id))
    .map((e) => {
      const rect = rectOf(e);
      if (e.kind === 'area') return { kind: e.kind, label: e.label, ...rect };
      if (e.kind === 'cubicle')
        return { kind: e.kind, ...(e.cubicleId ? { cubicleId: e.cubicleId } : {}), ...rect };
      return {
        kind: e.kind,
        ...(e.seatId ? { seatId: e.seatId } : {}),
        ...(e.cubicleId ? { cubicleId: e.cubicleId } : {}),
        ...rect,
      };
    });
  return { version: state.version, columns: state.columns, rows: state.rows, elements };
}

const centre = (e: Rect) => ({ x: e.x + e.w / 2, y: e.y + e.h / 2 });

// Nearest centre inside a 90 degree cone (|cross| <= along) in the given direction.
export function neighbour(
  elements: LayoutElementDraft[],
  fromId: string,
  dir: Direction,
): string | null {
  const from = elements.find((e) => e.id === fromId);
  if (!from) return null;
  const c = centre(from);
  let best: { id: string; d: number } | null = null;
  for (const e of elements) {
    if (e.id === fromId) continue;
    const p = centre(e);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy;
    const across = dir === 'left' || dir === 'right' ? dy : dx;
    if (along <= 0 || Math.abs(across) > along) continue;
    const d = dx * dx + dy * dy;
    if (!best || d < best.d) best = { id: e.id, d };
  }
  return best?.id ?? null;
}
