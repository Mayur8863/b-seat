import {
  type Action,
  type DraftState,
  isSeatOutsideCubicle,
  type LayoutElementDraft,
} from './model';

type Labeller = (e: LayoutElementDraft) => string;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const at = (e: LayoutElementDraft) => `column ${String(e.x + 1)}, row ${String(e.y + 1)}`;
const squares = (n: number) => `${String(n)} ${n === 1 ? 'square' : 'squares'}`;

// The first seat whose "inside its cubicle" state differs between the two drafts.
function containmentChange(
  before: DraftState,
  after: DraftState,
  labelOf: Labeller,
): string | null {
  for (const seat of after.elements) {
    if (seat.kind !== 'seat') continue;
    const was = isSeatOutsideCubicle(before, seat.id);
    const now = isSeatOutsideCubicle(after, seat.id);
    if (was === now) continue;
    const cubicle = after.elements.find(
      (e) => e.kind === 'cubicle' && e.cubicleId === seat.cubicleId,
    );
    if (!cubicle) continue;
    const names = `seat ${labelOf(seat)}`;
    return now
      ? `${cap(names)} is outside cubicle ${labelOf(cubicle)}.`
      : `${cap(names)} is inside cubicle ${labelOf(cubicle)} again.`;
  }
  return null;
}

function direction(dx: number, dy: number): string {
  if (dx !== 0) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/** The live-region sentence for an action (ui/05 3.5), or null when nothing should be announced. */
export function describeChange(
  before: DraftState,
  after: DraftState,
  action: Action,
  labelOf: Labeller,
): string | null {
  const find = (s: DraftState, id: string | null) => s.elements.find((e) => e.id === id);
  const name = (e: LayoutElementDraft) => `${e.kind} ${labelOf(e)}`;

  switch (action.type) {
    case 'select': {
      const e = find(after, action.id);
      return e ? `Selected ${name(e)}.` : null;
    }
    case 'grab': {
      const e = find(after, action.id);
      return e && after.grabbed
        ? `Picked up ${name(e)} at ${at(e)}. Arrow keys move it. Shift and arrow keys resize it. Space drops it. Escape cancels.`
        : null;
    }
    case 'move':
    case 'resize':
    case 'setRect': {
      const id = action.type === 'setRect' ? action.id : (before.grabbed?.id ?? before.selectedId);
      const e = find(after, id);
      if (!e) return null;
      const { blocked } = after;
      if (blocked?.reason === 'edge') {
        if (action.type === 'move') {
          return `${cap(name(e))} can't move ${direction(action.dx, action.dy)}. It is at the edge of the grid.`;
        }
        return `${cap(name(e))} can't go there. It would leave the grid.`;
      }
      if (blocked?.reason === 'overlap') {
        return `${cap(name(e))} can't go there. ${cap(e.kind)} ${blocked.with} is in the way.`;
      }
      if (blocked) return null;
      const lead =
        action.type === 'resize'
          ? `${cap(name(e))} is now ${squares(e.w)} wide and ${String(e.h)} high.`
          : action.type === 'move'
            ? `${cap(name(e))} moved to ${at(e)}.`
            : `${cap(name(e))} is at ${at(e)}, ${String(e.w)} by ${String(e.h)}.`;
      const extra = containmentChange(before, after, labelOf);
      return extra ? `${lead} ${extra}` : lead;
    }
    case 'drop': {
      const e = find(after, before.grabbed?.id ?? null);
      return e ? `Dropped ${name(e)} at ${at(e)}.` : null;
    }
    case 'cancel': {
      const e = find(after, before.grabbed?.id ?? null);
      return e ? `Move cancelled. ${cap(name(e))} is back at ${at(e)}.` : null;
    }
    case 'place': {
      if (after.blocked?.reason === 'no-space') {
        return `There is no free space for another ${action.kind} on the grid.`;
      }
      const e = find(after, after.selectedId);
      return !after.blocked && e
        ? `${cap(name(e))} placed at ${at(e)}. Press space to pick it up.`
        : null;
    }
    case 'removeFromPlan':
    case 'deleteArea': {
      const e = find(before, action.id);
      if (!e || after.blocked) return null;
      return e.kind === 'area'
        ? `${cap(name(e))} deleted.`
        : `${cap(name(e))} removed from the plan.`;
    }
    default:
      return null;
  }
}
