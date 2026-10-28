import type { Action, DraftState, LayoutElementDraft } from './model';

export function describeChange(
  _before: DraftState,
  _after: DraftState,
  _action: Action,
  _labelOf: (e: LayoutElementDraft) => string,
): string | null {
  return null;
}
