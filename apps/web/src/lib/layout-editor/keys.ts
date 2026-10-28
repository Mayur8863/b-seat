import { type Action, type DraftState, type Direction, neighbour, readingOrder } from './model';

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

const ARROWS: Record<string, { dir: Direction; dx: number; dy: number }> = {
  ArrowUp: { dir: 'up', dx: 0, dy: -1 },
  ArrowDown: { dir: 'down', dx: 0, dy: 1 },
  ArrowLeft: { dir: 'left', dx: -1, dy: 0 },
  ArrowRight: { dir: 'right', dx: 1, dy: 0 },
};
const IGNORED: KeyResult = { actions: [], preventDefault: false };
const handled = (r: Omit<KeyResult, 'preventDefault'>): KeyResult => ({
  ...r,
  preventDefault: true,
});

/** The keyboard model of ui/05 3.3 as a pure function: what a key does on the focused plan item. */
export function planKey(state: DraftState, focusedId: string, input: KeyInput): KeyResult {
  const arrow = ARROWS[input.key];
  if (state.grabbed) {
    if (arrow) {
      return handled({
        actions: [
          input.shiftKey
            ? { type: 'resize', dw: arrow.dx, dh: arrow.dy }
            : { type: 'move', dx: arrow.dx, dy: arrow.dy },
        ],
      });
    }
    if (input.key === ' ' || input.key === 'Enter') return handled({ actions: [{ type: 'drop' }] });
    if (input.key === 'Escape') return handled({ actions: [{ type: 'cancel' }] });
    // An item never stays picked up out of sight, so Tab drops it and then leaves normally.
    if (input.key === 'Tab') return { actions: [{ type: 'drop' }], preventDefault: false };
    return IGNORED;
  }
  if (arrow) {
    const next = neighbour(state.elements, focusedId, arrow.dir);
    return next
      ? handled({ actions: [], focusId: next })
      : handled({ actions: [], message: `No item to the ${arrow.dir}.` });
  }
  const order = readingOrder(state.elements);
  switch (input.key) {
    case 'Home':
      return handled({ actions: [], focusId: order[0]?.id ?? null });
    case 'End':
      return handled({ actions: [], focusId: order[order.length - 1]?.id ?? null });
    case 'Enter':
      return handled({ actions: [{ type: 'select', id: focusedId }], editName: true });
    case ' ':
      return handled({ actions: [{ type: 'grab', id: focusedId }] });
    case 'Delete':
    case 'Backspace': {
      const rest = order.filter((e) => e.id !== focusedId);
      const near =
        (['right', 'down', 'left', 'up'] as const)
          .map((d) => neighbour(state.elements, focusedId, d))
          .find((id) => id !== null) ??
        rest[0]?.id ??
        null;
      return handled({ actions: [{ type: 'removeFromPlan', id: focusedId }], focusId: near });
    }
    case 'Escape':
      return handled({ actions: [{ type: 'clear' }] });
    default:
      return IGNORED;
  }
}
