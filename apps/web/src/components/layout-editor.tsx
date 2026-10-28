'use client';

import {
  getListingLayoutGetQueryKey,
  getOwnerLayoutGetQueryKey,
  getOwnerSpacesGetQueryKey,
  type Cubicle,
  type OwnerLayout,
  type OwnerSeat,
  useOwnerLayoutGet,
  useOwnerLayoutSave,
  useOwnerSeatsListCubicles,
  useOwnerSeatsListSeats,
} from '@bseat/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@bseat/ui/components/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button, buttonVariants } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { Input } from '@bseat/ui/components/input';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { toast } from '@bseat/ui/components/sonner';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheckIcon, InfoIcon, LayoutGridIcon, ListIcon, Loader2Icon } from 'lucide-react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { LayoutAddForm } from '@/components/layout-add-form';
import { LayoutItemForm, NAME_FIELD_ID } from '@/components/layout-item-form';
import { LayoutItemsList } from '@/components/layout-items-list';
import { type Apply, LayoutPlan } from '@/components/layout-plan';
import { FormField } from '@/components/space-form/form-field';
import { type PlaceRequest, UnplacedTray } from '@/components/unplaced-tray';
import { useSeatRefresh } from '@/components/use-seat-refresh';
import { describeChange } from '@/lib/layout-editor/messages';
import {
  type Action,
  createDraft,
  type DraftState,
  type LayoutElementDraft,
  readingOrder,
  reduce,
  toSaveInput,
  validate,
} from '@/lib/layout-editor/model';
import { describeLayoutProblem, type LayoutProblem } from '@/lib/layout-editor/problems';
import type { ProblemCopy } from '@/lib/problem-copy';

const THROTTLE_MS = 300;
const afterRender = (fn: () => void) => {
  requestAnimationFrame(fn);
};

function GridSize({
  state,
  apply,
  disabled,
}: {
  state: DraftState;
  apply: Apply;
  disabled: boolean;
}) {
  const [cols, setCols] = useState(String(state.columns));
  const [rows, setRows] = useState(String(state.rows));
  const [errors, setErrors] = useState<{ columns?: string; rows?: string }>({});

  const commit = () => {
    const c = Number(cols);
    const r = Number(rows);
    const result = apply({ type: 'setGrid', columns: c, rows: r }, { quiet: true });
    const b = result.blocked;
    if (!b) {
      setErrors({});
      return;
    }
    if (b.reason === 'items-outside') {
      const text = `Items extend past ${b.axis} ${String(b.index)}. Move them first.`;
      setErrors(b.axis === 'column' ? { columns: text } : { rows: text });
    } else {
      const bad = 'Use a number from 10 to 80.';
      const ok = (n: number) => Number.isInteger(n) && n >= 10 && n <= 80;
      setErrors({ ...(ok(c) ? {} : { columns: bad }), ...(ok(r) ? {} : { rows: bad }) });
    }
  };
  const field = (
    id: string,
    label: string,
    value: string,
    set: (v: string) => void,
    error?: string,
  ) => (
    <FormField id={id} label={label} error={error}>
      {(aria) => (
        <Input
          {...aria}
          type="number"
          inputMode="numeric"
          min={10}
          max={80}
          className="w-24"
          value={value}
          disabled={disabled}
          onChange={(e) => {
            set(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
        />
      )}
    </FormField>
  );
  return (
    <fieldset className="grid gap-1">
      <legend className="text-sm font-medium">Grid size</legend>
      <p className="text-muted-foreground text-sm">Squares across and down. 10 to 80.</p>
      <div className="flex gap-3">
        {field('grid-columns', 'Columns', cols, setCols, errors.columns)}
        {field('grid-rows', 'Rows', rows, setRows, errors.rows)}
      </div>
    </fieldset>
  );
}

interface EditorProps {
  spaceId: string;
  layout: OwnerLayout;
  seatList: OwnerSeat[] | undefined;
  cubicleList: Cubicle[] | undefined;
  listsFailed: boolean;
  onRetryLists: () => void;
  onReload: () => Promise<void>;
}

function Editor({
  spaceId,
  layout,
  seatList,
  cubicleList,
  listsFailed,
  onRetryLists,
  onReload,
}: EditorProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const seatRefresh = useSeatRefresh(spaceId);
  const save = useOwnerLayoutSave();
  const [state, setState] = useState(() => createDraft(layout));
  const stateRef = useRef(state);
  const [saved, setSaved] = useState(layout);
  const [message, setMessage] = useState('');
  const [focusReq, setFocusReq] = useState<{ id: string | null; n: number } | null>(null);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [problems, setProblems] = useState<{
    title: string;
    items: { id?: string; text: string }[];
  } | null>(null);
  const [saveProblem, setSaveProblem] = useState<LayoutProblem | null>(null);
  const [pageProblem, setPageProblem] = useState<ProblemCopy | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const pageAlertRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const editRow = useRef<string | null>(null);

  const labelOf = (e: LayoutElementDraft) => {
    if (e.kind === 'seat') return seatList?.find((s) => s.id === e.seatId)?.label ?? e.label;
    if (e.kind === 'cubicle')
      return cubicleList?.find((c) => c.id === e.cubicleId)?.name ?? e.label;
    return e.label;
  };

  const say = (text: string) => {
    setMessage(text);
  };
  // Held arrow keys would flood the live region, so repeats collapse to the latest text every 300 ms.
  const sayThrottled = (text: string) => {
    if (timer.current) {
      pending.current = text;
      return;
    }
    say(text);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (pending.current) say(pending.current);
      pending.current = null;
    }, THROTTLE_MS);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const apply: Apply = (action: Action, options) => {
    const before = stateRef.current;
    const after = reduce(before, action);
    stateRef.current = after;
    setState(after);
    if (!options?.quiet) {
      const text = describeChange(before, after, action, labelOf);
      if (text) {
        if (action.type === 'move' || action.type === 'resize') sayThrottled(text);
        else say(text);
      }
    }
    if (problems) setProblems(null);
    return after;
  };
  const replace = (next: DraftState) => {
    stateRef.current = next;
    setState(next);
  };
  const focusPlan = (id: string | null) => {
    setFocusReq((r) => ({ id, n: (r?.n ?? 0) + 1 }));
  };
  const focusName = () => {
    afterRender(() => document.getElementById(NAME_FIELD_ID)?.focus());
  };

  useEffect(() => {
    if (problems ?? saveProblem) alertRef.current?.focus();
  }, [problems, saveProblem]);
  useEffect(() => {
    if (pageProblem) pageAlertRef.current?.focus();
  }, [pageProblem]);

  // Leave-page guard (OQ-T61-5): the browser prompt for reloads and tab closes, our dialog for in-app links.
  useEffect(() => {
    if (!state.dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
      const href = a?.getAttribute('href');
      if (!a || !href?.startsWith('/') || a.getAttribute('target') === '_blank') return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(href);
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [state.dirty]);

  const refresh = () => {
    seatRefresh();
    void queryClient.invalidateQueries({ queryKey: getOwnerLayoutGetQueryKey(spaceId) });
  };

  const placeItem = (kind: 'seat' | 'cubicle' | 'area', request: Omit<PlaceRequest, 'kind'>) => {
    const after = apply({ type: 'place', kind, ...request });
    if (after.blocked?.reason === 'no-space') return false;
    focusPlan(after.selectedId);
    return true;
  };

  const showProblems = (list: ReturnType<typeof validate>) => {
    setProblems({
      title:
        list[0]?.code === 'empty'
          ? 'Nothing to save yet'
          : `Fix ${String(list.length)} ${list.length === 1 ? 'item' : 'items'} before saving`,
      items: list.map((p) => ({ ...(p.id ? { id: p.id } : {}), text: p.message })),
    });
  };

  const onSave = () => {
    setSaveProblem(null);
    setJustSaved(false);
    const list = validate(stateRef.current);
    if (list.length > 0) {
      showProblems(list);
      return;
    }
    setProblems(null);
    save.mutate(
      { spaceId, data: toSaveInput(stateRef.current) },
      {
        onSuccess: (res) => {
          setSaved(res.data);
          replace(createDraft(res.data));
          setJustSaved(true);
          toast.success('Layout saved');
          say('Layout saved.');
          for (const queryKey of [
            getOwnerLayoutGetQueryKey(spaceId),
            getOwnerSpacesGetQueryKey(spaceId),
            getListingLayoutGetQueryKey(spaceId),
          ]) {
            void queryClient.invalidateQueries({ queryKey });
          }
        },
        onError: (error) => {
          const p = describeLayoutProblem(error);
          setSaveProblem(p);
          if (p.revalidate) {
            const list = validate(stateRef.current);
            if (list.length > 0) showProblems(list);
          }
        },
      },
    );
  };

  const discard = () => {
    setDiscarding(false);
    replace(createDraft(saved));
    setProblems(null);
    setSaveProblem(null);
    say('Changes discarded.');
    toast.success('Changes discarded');
    focusPlan(readingOrder(stateRef.current.elements)[0]?.id ?? null);
  };

  const onGone = (id: string) => {
    editRow.current = null;
    const next = readingOrder(stateRef.current.elements).find((e) => e.id !== id);
    focusPlan(next?.id ?? null);
  };

  const saving = save.isPending;
  const status = state.dirty
    ? 'Unsaved changes'
    : justSaved || state.version > 0
      ? 'All changes saved'
      : '';
  const items = state.elements;
  const total = items.length;
  const firstUse = state.version === 0 && total === 0;

  return (
    <div className="grid gap-4" aria-busy={saving || undefined}>
      <div role="toolbar" aria-label="Layout actions" className="flex flex-wrap items-end gap-4">
        <div role="group" aria-label="Layout view" className="flex gap-2 md:hidden">
          <Button
            type="button"
            variant="outline"
            aria-pressed={view === 'list'}
            onClick={() => {
              setView('list');
            }}
          >
            <ListIcon aria-hidden="true" /> List view
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-pressed={view === 'grid'}
            onClick={() => {
              setView('grid');
            }}
          >
            <LayoutGridIcon aria-hidden="true" /> Grid view
          </Button>
        </div>
        <GridSize
          key={`${String(state.columns)}x${String(state.rows)}`}
          state={state}
          apply={apply}
          disabled={saving}
        />
        <Button type="button" onClick={onSave} disabled={saving} aria-busy={saving || undefined}>
          {saving ? (
            <>
              <Loader2Icon aria-hidden="true" className="animate-spin" /> Saving…
            </>
          ) : (
            'Save layout'
          )}
        </Button>
        {state.dirty && (
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => {
              setDiscarding(true);
            }}
          >
            Discard changes
          </Button>
        )}
        <p role="status" className="text-muted-foreground flex items-center gap-1 text-sm">
          {!state.dirty && status && (
            <CircleCheckIcon aria-hidden="true" className="text-success size-4" />
          )}
          {status}
        </p>
      </div>
      <p className="text-muted-foreground text-sm md:hidden">
        Positions are easiest to set with the list and the form on a small screen.
      </p>

      {(problems ?? saveProblem) && (
        <Alert variant="destructive" role="alert" ref={alertRef} tabIndex={-1}>
          <AlertTitle>{problems?.title ?? saveProblem?.title}</AlertTitle>
          <AlertDescription>
            <p>
              {problems
                ? problems.items.some((i) => i.id)
                  ? 'Keep every item inside the grid, and every seat inside its cubicle.'
                  : 'Place at least one seat on the plan, then save.'
                : saveProblem?.description}
            </p>
            {problems && (
              <ul className="grid gap-1">
                {problems.items
                  .filter((i) => i.id)
                  .map((i) => (
                    <li key={i.id}>
                      <Button
                        type="button"
                        variant="link"
                        onClick={() => {
                          if (!i.id) return;
                          apply({ type: 'select', id: i.id }, { quiet: true });
                          setView('grid');
                          focusPlan(i.id);
                        }}
                      >
                        {i.text}
                      </Button>
                    </li>
                  ))}
              </ul>
            )}
            {saveProblem?.reload && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void onReload();
                }}
              >
                Reload layout
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {pageProblem && (
        <Alert variant="destructive" role="alert" ref={pageAlertRef} tabIndex={-1}>
          <AlertTitle>{pageProblem.title}</AlertTitle>
          <AlertDescription>
            {pageProblem.description.map((p) => (typeof p === 'string' ? p : p.text))}
          </AlertDescription>
        </Alert>
      )}

      {firstUse && (
        <Card>
          <CardContent className="flex items-start gap-3">
            <InfoIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-medium">You haven&apos;t drawn a plan yet.</p>
              <p className="text-muted-foreground text-sm">
                Add a seat or place one from the list, then save. Until you save, renters see the
                seat list only.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className={view === 'grid' ? 'grid gap-3' : 'hidden gap-3 md:grid'}>
          <LayoutPlan
            state={state}
            apply={apply}
            say={say}
            labelOf={labelOf}
            onEditName={focusName}
            focusRequest={focusReq}
            disabled={saving}
          />
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Keyboard shortcuts</summary>
            <dl className="mt-2 grid gap-1">
              {[
                ['Arrow keys', 'Move between items'],
                ['Space', 'Pick up an item; Space again drops it'],
                ['Arrow keys (picked up)', 'Move the item one square'],
                ['Shift and arrow keys', 'Resize the item'],
                ['Escape', 'Cancel a pick-up, or clear the selection'],
                ['Enter', 'Edit the name'],
                ['Delete', 'Remove the item from the plan'],
              ].map(([key, action]) => (
                <div key={key} className="flex gap-2">
                  <dt className="font-medium">{key}</dt>
                  <dd className="text-muted-foreground">{action}</dd>
                </div>
              ))}
            </dl>
          </details>
        </div>
        <div className="grid content-start gap-4">
          <LayoutItemForm
            state={state}
            apply={apply}
            labelOf={labelOf}
            spaceId={spaceId}
            cubicles={cubicleList}
            refresh={refresh}
            disabled={saving}
            onPageProblem={(copy) => {
              setPageProblem({ ...copy });
            }}
            onGone={onGone}
          />
          <LayoutAddForm
            spaceId={spaceId}
            seatCount={seatList?.length ?? 0}
            refresh={refresh}
            onPlace={placeItem}
            disabled={saving}
          />
          <UnplacedTray
            state={state}
            seats={seatList}
            cubicles={cubicleList}
            failed={listsFailed}
            onRetry={onRetryLists}
            onPlace={(r) => placeItem(r.kind, r)}
            disabled={saving}
          />
        </div>
      </div>

      <LayoutItemsList
        state={state}
        labelOf={labelOf}
        disabled={saving}
        onEdit={(id) => {
          editRow.current = id;
          apply({ type: 'select', id });
          focusName();
        }}
      />

      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {message}
      </p>

      <AlertDialog open={discarding} onOpenChange={setDiscarding}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Positions, sizes and areas go back to the last saved layout. Seats and cubicles you
              added or renamed stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={discard}
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={leaveTo !== null}
        onOpenChange={(open) => {
          if (!open) setLeaveTo(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
            <AlertDialogDescription>
              Your positions, sizes and areas haven&apos;t been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const to = leaveTo;
                setLeaveTo(null);
                // The dirty flag is still set, so drop the click guard before navigating.
                replace({ ...stateRef.current, dirty: false });
                if (to) router.push(to as Route);
              }}
            >
              Leave page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Layout page body (ui/05 2 and 7). The `[spaceId]` layout owns the space's 404 and sub-nav. */
export function LayoutEditor({ spaceId }: { spaceId: string }) {
  const layoutQuery = useOwnerLayoutGet(spaceId);
  const seats = useOwnerSeatsListSeats(spaceId);
  const cubicles = useOwnerSeatsListCubicles(spaceId);
  const [epoch, setEpoch] = useState(0);
  const layout = layoutQuery.data?.data;
  const seatsSettled = !seats.isPending && !cubicles.isPending;

  const reload = async () => {
    await layoutQuery.refetch();
    setEpoch((n) => n + 1);
  };

  let body;
  if (layoutQuery.isError) {
    body = (
      <Alert variant="destructive">
        <AlertTitle>We couldn&apos;t load the layout</AlertTitle>
        <AlertDescription>
          <p>Try again in a moment.</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void layoutQuery.refetch();
            }}
          >
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (!layout || !seatsSettled) {
    body = (
      <div aria-busy="true" className="grid gap-4">
        <span role="status" aria-live="polite" className="sr-only">
          Loading layout…
        </span>
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-96 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  } else {
    body = (
      <Editor
        key={epoch}
        spaceId={spaceId}
        layout={layout}
        seatList={seats.data?.data.items}
        cubicleList={cubicles.data?.data.items}
        listsFailed={seats.isError || cubicles.isError}
        onRetryLists={() => {
          void seats.refetch();
          void cubicles.refetch();
        }}
        onReload={reload}
      />
    );
  }

  return (
    <main id="main" className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Layout</h1>
        <p className="text-muted-foreground">
          Draw your floor plan. Renters see it once you save, and can always switch to the seat
          list.
        </p>
        <p className="text-muted-foreground text-sm">
          Saved right away: adding, renaming and deleting seats and cubicles. Saved with the layout:
          positions, sizes and areas.
        </p>
      </div>
      {body}
    </main>
  );
}
