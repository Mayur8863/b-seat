'use client';

import { Button } from '@bseat/ui/components/button';
import { TriangleAlertIcon } from 'lucide-react';

import { problemOf } from '@/components/layout-plan';
import { type DraftState, type LayoutElementDraft, readingOrder } from '@/lib/layout-editor/model';

/** "All items" (ui/05 5.5): the full form alternative to the plan. */
export function LayoutItemsList({
  state,
  labelOf,
  onEdit,
  disabled,
}: {
  state: DraftState;
  labelOf: (e: LayoutElementDraft) => string;
  onEdit: (id: string) => void;
  disabled: boolean;
}) {
  const items = readingOrder(state.elements);
  return (
    <section aria-labelledby="all-items-heading" className="grid gap-3">
      <h2 id="all-items-heading" className="text-lg font-medium">
        All items ({items.length})
      </h2>
      {items.length > 0 && (
        <ul aria-label="All items" className="bg-card divide-y rounded-xl border">
          {items.map((e) => {
            const problem = problemOf(state, e, labelOf);
            const kind = e.kind.charAt(0).toUpperCase() + e.kind.slice(1);
            return (
              <li
                key={e.id}
                data-item-row={e.id}
                className="hover:bg-muted/50 flex items-center justify-between gap-3 p-3"
              >
                <div className="grid gap-0.5">
                  <span>
                    <span className="text-muted-foreground text-sm">{kind}</span>{' '}
                    <span className="font-medium">{labelOf(e)}</span>
                  </span>
                  <span className="text-muted-foreground text-sm">
                    column {e.x + 1}, row {e.y + 1}, {e.w} by {e.h}
                  </span>
                  {problem && (
                    <span className="text-destructive flex items-center gap-1 text-sm">
                      <TriangleAlertIcon aria-hidden="true" className="size-4" />
                      Problem: {problem}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  data-edit-id={e.id}
                  onClick={() => {
                    onEdit(e.id);
                  }}
                >
                  Edit{' '}
                  <span className="sr-only">
                    {e.kind} {labelOf(e)}
                  </span>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
