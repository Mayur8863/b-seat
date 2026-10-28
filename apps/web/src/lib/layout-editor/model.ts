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
  | { type: 'setGrid'; columns: number; rows: number };
export interface Problem {
  code: 'seat-outside-cubicle' | 'outside-grid' | 'empty' | 'too-many';
  id?: string;
  message: string;
}

export function createDraft(_layout: OwnerLayout): DraftState {
  throw new Error('todo');
}
export function reduce(_state: DraftState, _action: Action): DraftState {
  throw new Error('todo');
}
export function validate(_state: DraftState): Problem[] {
  throw new Error('todo');
}
export function toSaveInput(_state: DraftState): SaveLayoutInput {
  throw new Error('todo');
}
export function readingOrder(_elements: LayoutElementDraft[]): LayoutElementDraft[] {
  throw new Error('todo');
}
export function neighbour(
  _elements: LayoutElementDraft[],
  _fromId: string,
  _dir: Direction,
): string | null {
  throw new Error('todo');
}
export function isSeatOutsideCubicle(_state: DraftState, _id: string): boolean {
  throw new Error('todo');
}
