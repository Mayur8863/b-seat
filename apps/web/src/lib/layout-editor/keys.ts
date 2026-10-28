import { type Action, type DraftState, type Direction } from './model';

export interface KeyInput {
  key: string;
  shiftKey: boolean;
}
export interface KeyResult {
  actions: Action[];
  /** Roving focus target: an element id, or null to focus the plan region. */
  focusId?: string | null;
  /** Enter on an item: select it and focus the panel's Name field. */
  editName?: boolean;
  message?: string;
  preventDefault: boolean;
}

export function planKey(_state: DraftState, _focusedId: string, _input: KeyInput): KeyResult {
  return { actions: [], preventDefault: false };
}
export const DIRECTION_OF: Record<string, Direction> = {};
