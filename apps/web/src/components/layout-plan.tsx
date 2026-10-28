'use client';

import { cn } from '@bseat/ui/lib/utils';
import { ArmchairIcon, SquareDashedIcon, TagIcon, TriangleAlertIcon } from 'lucide-react';
import { type PointerEvent, useEffect, useRef, useState } from 'react';

import { planKey } from '@/lib/layout-editor/keys';
import {
  type Action,
  type DraftState,
  isSeatOutsideCubicle,
  type LayoutElementDraft,
  readingOrder,
} from '@/lib/layout-editor/model';

/** Square size in px (ui/05 3.1). */
export const CELL = 24;
const DRAG_THRESHOLD = 4;

export interface ApplyOptions {
  /** Pointer drags announce only the drop (ui/05 3.5). */
  quiet?: boolean;
}
export type Apply = (action: Action, options?: ApplyOptions) => DraftState;

interface DragState {
  mode: 'move' | 'resize';
  id: string;
  startX: number;
  startY: number;
  applied: { x: number; y: number };
  active: boolean;
}

interface Props {
  state: DraftState;
  apply: Apply;
  say: (text: string) => void;
  labelOf: (e: LayoutElementDraft) => string;
  onEditName: () => void;
  /** Ask the plan to focus an item (or the region for null); `n` makes repeat requests distinct. */
  focusRequest: { id: string | null; n: number } | null;
  disabled: boolean;
}

const KIND_ICON = { seat: ArmchairIcon, cubicle: SquareDashedIcon, area: TagIcon } as const;
const KIND_STYLE = {
  seat: 'z-10 rounded-md border border-muted-foreground bg-card text-card-foreground hover:bg-muted/50',
  cubicle:
    'z-0 rounded-lg border-2 border-dashed border-muted-foreground bg-muted/40 text-muted-foreground hover:bg-muted',
  area: 'z-0 rounded-lg border border-muted-foreground bg-secondary text-secondary-foreground hover:bg-muted',
} as const;

export function problemOf(
  state: DraftState,
  e: LayoutElementDraft,
  labelOf: (e: LayoutElementDraft) => string,
): string | null {
  if (e.x < 0 || e.y < 0 || e.x + e.w > state.columns || e.y + e.h > state.rows) {
    return 'outside the grid';
  }
  if (isSeatOutsideCubicle(state, e.id)) {
    const cubicle = state.elements.find((c) => c.kind === 'cubicle' && c.cubicleId === e.cubicleId);
    return `outside cubicle ${cubicle ? labelOf(cubicle) : ''}`.trim();
  }
  return null;
}

export function itemName(
  state: DraftState,
  e: LayoutElementDraft,
  labelOf: (e: LayoutElementDraft) => string,
): string {
  const kind = e.kind.charAt(0).toUpperCase() + e.kind.slice(1);
  const parts = [
    `${kind} ${labelOf(e)}`,
    `column ${String(e.x + 1)}, row ${String(e.y + 1)}`,
    `${String(e.w)} by ${String(e.h)} squares`,
  ];
  if (e.kind === 'cubicle') {
    const n = state.elements.filter((s) => s.kind === 'seat' && s.cubicleId === e.cubicleId).length;
    parts.push(`${String(n)} ${n === 1 ? 'seat' : 'seats'}`);
  }
  if (e.kind === 'seat' && e.cubicleId) {
    const cubicle = state.elements.find((c) => c.kind === 'cubicle' && c.cubicleId === e.cubicleId);
    if (cubicle) parts.push(`in cubicle ${labelOf(cubicle)}`);
  }
  const problem = problemOf(state, e, labelOf);
  if (problem) parts.push(`problem: ${problem}`);
  return parts.join(', ');
}

/** The floor plan: buttons on a CSS grid with one roving tab stop (ui/05 3.1 to 3.4). */
export function LayoutPlan({
  state,
  apply,
  say,
  labelOf,
  onEditName,
  focusRequest,
  disabled,
}: Props) {
  const region = useRef<HTMLDivElement>(null);
  const items = useRef(new Map<string, HTMLButtonElement>());
  const drag = useRef<DragState | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.id === null) region.current?.focus();
    else items.current.get(focusRequest.id)?.focus();
  }, [focusRequest]);

  const order = readingOrder(state.elements);
  const tabId =
    [focusedId, state.selectedId].find((id) => id && state.elements.some((e) => e.id === id)) ??
    order[0]?.id ??
    null;

  const onKeyDown = (e: LayoutElementDraft, ev: React.KeyboardEvent) => {
    const result = planKey(state, e.id, { key: ev.key, shiftKey: ev.shiftKey });
    if (result.preventDefault) ev.preventDefault();
    if (result.actions.some((a) => a.type === 'cancel')) drag.current = null;
    for (const action of result.actions) apply(action);
    if (result.message) say(result.message);
    if (result.focusId === null) region.current?.focus();
    else if (result.focusId) items.current.get(result.focusId)?.focus();
    if (result.editName) onEditName();
  };

  const capture = (ev: PointerEvent) => {
    if ('setPointerCapture' in ev.currentTarget) ev.currentTarget.setPointerCapture(ev.pointerId);
  };

  const onItemDown = (e: LayoutElementDraft, ev: PointerEvent<HTMLButtonElement>) => {
    if (disabled || ev.button !== 0) return;
    apply({ type: 'select', id: e.id });
    drag.current = {
      mode: 'move',
      id: e.id,
      startX: ev.clientX,
      startY: ev.clientY,
      applied: { x: 0, y: 0 },
      active: false,
    };
    capture(ev);
  };

  const onHandleDown = (e: LayoutElementDraft, ev: PointerEvent<HTMLSpanElement>) => {
    if (disabled || ev.button !== 0) return;
    ev.stopPropagation();
    drag.current = {
      mode: 'resize',
      id: e.id,
      startX: ev.clientX,
      startY: ev.clientY,
      applied: { x: 0, y: 0 },
      active: true,
    };
    capture(ev);
  };

  const onMove = (ev: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = ev.clientX - d.startX;
    const dy = ev.clientY - d.startY;
    if (!d.active) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.active = true;
      apply({ type: 'grab', id: d.id }, { quiet: true });
    }
    const want = { x: Math.round(dx / CELL), y: Math.round(dy / CELL) };
    const step = { x: want.x - d.applied.x, y: want.y - d.applied.y };
    if (step.x === 0 && step.y === 0) return;
    const next = apply(
      d.mode === 'move'
        ? { type: 'move', dx: step.x, dy: step.y }
        : { type: 'resize', dw: step.x, dh: step.y },
      { quiet: true },
    );
    // A blocked step leaves the item on its last valid square.
    if (next.blocked === null) d.applied = want;
  };

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    if (d.mode === 'move') apply({ type: 'drop' });
    else apply({ type: 'resize', dw: 0, dh: 0 });
  };

  return (
    <div
      ref={region}
      role="region"
      aria-label={`Floor plan, ${String(state.columns)} by ${String(state.rows)} squares`}
      tabIndex={-1}
      className="bg-card max-h-[70vh] overflow-auto rounded-xl border"
    >
      <div
        role="group"
        aria-labelledby="plan-label"
        aria-describedby="plan-help"
        className="relative"
        style={{
          width: state.columns * CELL,
          height: state.rows * CELL,
          backgroundImage:
            'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
          backgroundSize: `${String(CELL)}px ${String(CELL)}px`,
        }}
        onPointerDown={(ev) => {
          if (ev.target === ev.currentTarget && !disabled)
            apply({ type: 'clear' }, { quiet: true });
        }}
      >
        <span id="plan-label" className="sr-only">
          Floor plan items
        </span>
        <span id="plan-help" className="sr-only">
          Arrow keys move between items. Space picks an item up; arrow keys then move it, Shift and
          arrow keys resize it, Space drops it, Escape cancels. Enter edits the name. Delete removes
          it from the plan.
        </span>
        {order.map((e) => {
          const Icon = KIND_ICON[e.kind];
          const selected = state.selectedId === e.id;
          const grabbed = state.grabbed?.id === e.id;
          const problem = problemOf(state, e, labelOf);
          return (
            <button
              key={e.id}
              type="button"
              ref={(node) => {
                if (node) items.current.set(e.id, node);
                else items.current.delete(e.id);
              }}
              data-element-id={e.id}
              aria-label={itemName(state, e, labelOf)}
              aria-current={selected ? 'true' : undefined}
              aria-pressed={grabbed ? true : undefined}
              disabled={disabled}
              tabIndex={tabId === e.id ? 0 : -1}
              style={{
                left: e.x * CELL,
                top: e.y * CELL,
                width: e.w * CELL,
                height: e.h * CELL,
                touchAction: 'none',
              }}
              className={cn(
                'focus-visible:outline-ring absolute overflow-hidden text-xs focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50',
                KIND_STYLE[e.kind],
                selected && 'border-primary border-2',
                selected && e.kind !== 'cubicle' && 'bg-primary/5',
                grabbed && 'border-primary bg-primary/10 outline-primary outline-2 outline-dashed',
                problem && 'border-destructive border-2',
              )}
              onFocus={() => {
                setFocusedId(e.id);
              }}
              onKeyDown={(ev) => {
                onKeyDown(e, ev);
              }}
              onPointerDown={(ev) => {
                onItemDown(e, ev);
              }}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <span
                className={cn(
                  'flex size-full gap-1 p-0.5',
                  e.kind === 'cubicle'
                    ? 'items-start justify-start'
                    : 'items-center justify-center',
                )}
              >
                {e.w * e.h > 1 && <Icon aria-hidden="true" className="size-3 shrink-0" />}
                {(e.w > 1 || e.h > 1) && <span className="truncate font-medium">{labelOf(e)}</span>}
              </span>
              {problem && (
                <TriangleAlertIcon
                  aria-hidden="true"
                  className="text-destructive absolute top-0.5 right-0.5 size-3"
                />
              )}
              {selected && (
                <span
                  aria-hidden="true"
                  className="bg-primary absolute right-0 bottom-0 size-3 cursor-nwse-resize rounded-sm"
                  onPointerDown={(ev) => {
                    onHandleDown(e, ev);
                  }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
