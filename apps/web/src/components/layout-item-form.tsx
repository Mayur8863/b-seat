'use client';

import {
  type Cubicle,
  useOwnerSeatsDeleteCubicle,
  useOwnerSeatsDeleteSeat,
  useOwnerSeatsRenameCubicle,
  useOwnerSeatsUpdateSeat,
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
import { Button, buttonVariants } from '@bseat/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@bseat/ui/components/card';
import { Input } from '@bseat/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@bseat/ui/components/native-select';
import { toast } from '@bseat/ui/components/sonner';
import { InfoIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';

import { problemOf } from '@/components/layout-plan';
import { FormField } from '@/components/space-form/form-field';
import type { Action, DraftState, LayoutElementDraft } from '@/lib/layout-editor/model';
import type { ProblemCopy } from '@/lib/problem-copy';
import { describeSeatProblem } from '@/lib/seat-problems';

export const NAME_FIELD_ID = 'item-name';
const NAME_MAX = { seat: 20, cubicle: 100, area: 40 } as const;
const KIND_LABEL = { seat: 'seat', cubicle: 'cubicle', area: 'area' } as const;

export interface ItemFormProps {
  state: DraftState;
  apply: (action: Action) => DraftState;
  labelOf: (e: LayoutElementDraft) => string;
  spaceId: string;
  cubicles: Cubicle[] | undefined;
  refresh: () => void;
  disabled: boolean;
  onPageProblem: (copy: ProblemCopy) => void;
  /** An item left the draft through the panel (remove, delete): move focus on. */
  onGone: (id: string) => void;
}

function nameError(value: string, max: number): string | undefined {
  const v = value.trim();
  if (!v) return 'Enter a name';
  return v.length > max ? `Use ${String(max)} characters or fewer` : undefined;
}

type NumberField = 'x' | 'y' | 'w' | 'h';
const NUMBER_FIELDS: { key: NumberField; label: string; id: string }[] = [
  { key: 'x', label: 'Column', id: 'item-column' },
  { key: 'y', label: 'Row', id: 'item-row' },
  { key: 'w', label: 'Width', id: 'item-width' },
  { key: 'h', label: 'Height', id: 'item-height' },
];

function Fields({ element, ...p }: ItemFormProps & { element: LayoutElementDraft }) {
  const { state, apply, labelOf, spaceId, cubicles, refresh, disabled, onPageProblem, onGone } = p;
  const kind = element.kind;
  const [name, setName] = useState(labelOf(element));
  const [nameErr, setNameErr] = useState<string>();
  const [nums, setNums] = useState<Record<NumberField, string>>({
    x: String(element.x + 1),
    y: String(element.y + 1),
    w: String(element.w),
    h: String(element.h),
  });
  const [numErr, setNumErr] = useState<Partial<Record<NumberField, string>>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const updateSeat = useOwnerSeatsUpdateSeat();
  const renameCubicle = useOwnerSeatsRenameCubicle();
  const deleteSeat = useOwnerSeatsDeleteSeat();
  const deleteCubicle = useOwnerSeatsDeleteCubicle();
  const busy =
    updateSeat.isPending ||
    renameCubicle.isPending ||
    deleteSeat.isPending ||
    deleteCubicle.isPending;
  const off = disabled || busy;
  const problem = problemOf(state, element, labelOf);
  const containing =
    kind === 'seat'
      ? state.elements.find(
          (c) =>
            c.kind === 'cubicle' &&
            c.cubicleId !== element.cubicleId &&
            element.x >= c.x &&
            element.y >= c.y &&
            element.x + element.w <= c.x + c.w &&
            element.y + element.h <= c.y + c.h,
        )
      : undefined;

  const failed = (error: unknown, action: Parameters<typeof describeSeatProblem>[1]) => {
    const p2 = describeSeatProblem(error, action, { label: name.trim(), name: name.trim() });
    if (p2.field) setNameErr(p2.field);
    else if (p2.alert) onPageProblem(p2.alert);
  };

  const commitNumbers = (edited: NumberField) => {
    const parsed = Object.fromEntries(
      NUMBER_FIELDS.map((f) => [f.key, Number(nums[f.key])]),
    ) as Record<NumberField, number>;
    const field = NUMBER_FIELDS.find((f) => f.key === edited);
    const label = field?.label ?? '';
    const min = edited === 'x' || edited === 'y' ? 1 : 1;
    if (!Number.isInteger(parsed[edited]) || parsed[edited] < min) {
      setNumErr({ [edited]: `${label} must be at least 1` });
      return;
    }
    const result = apply({
      type: 'setRect',
      id: element.id,
      rect: { x: parsed.x - 1, y: parsed.y - 1, w: parsed.w, h: parsed.h },
    });
    if (result.blocked) {
      setNumErr({
        [edited]:
          result.blocked.reason === 'overlap'
            ? `Another ${KIND_LABEL[kind]} is in that place`
            : 'The item must fit inside the grid',
      });
    } else setNumErr({});
  };

  const submitName = (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    const error = nameError(name, NAME_MAX[kind]);
    setNameErr(error);
    if (error) return;
    const value = name.trim();
    if (kind === 'area') {
      apply({ type: 'renameArea', id: element.id, label: value });
    } else if (kind === 'seat' && element.seatId) {
      updateSeat.mutate(
        { spaceId, seatId: element.seatId, data: { label: value } },
        {
          onSuccess: () => {
            toast.success(`Seat ${value} saved`);
            refresh();
          },
          onError: (e) => {
            failed(e, 'edit seat');
          },
        },
      );
    } else if (element.cubicleId) {
      renameCubicle.mutate(
        { spaceId, cubicleId: element.cubicleId, data: { name: value } },
        {
          onSuccess: () => {
            toast.success(`Cubicle ${value} saved`);
            refresh();
          },
          onError: (e) => {
            failed(e, 'rename cubicle');
          },
        },
      );
    }
  };

  const assign = (cubicleId: string | null) => {
    if (!element.seatId) return;
    updateSeat.mutate(
      { spaceId, seatId: element.seatId, data: { cubicleId } },
      {
        onSuccess: () => {
          apply({ type: 'setCubicle', id: element.id, cubicleId });
          refresh();
        },
        onError: (e) => {
          failed(e, 'edit seat');
        },
      },
    );
  };

  const doDelete = () => {
    const done = () => {
      setConfirmDelete(false);
      apply({ type: 'forget', id: element.id });
      refresh();
      onGone(element.id);
    };
    const label = name.trim() || labelOf(element);
    if (kind === 'seat' && element.seatId) {
      deleteSeat.mutate(
        { spaceId, seatId: element.seatId },
        {
          onSuccess: () => {
            toast.success(`Seat ${label} removed`);
            done();
          },
          onError: (e) => {
            setConfirmDelete(false);
            failed(e, 'remove seat');
          },
        },
      );
    } else if (element.cubicleId) {
      deleteCubicle.mutate(
        { spaceId, cubicleId: element.cubicleId },
        {
          onSuccess: () => {
            toast.success(`Cubicle ${label} removed`);
            done();
          },
          onError: (e) => {
            setConfirmDelete(false);
            failed(e, 'remove cubicle');
          },
        },
      );
    }
  };

  const remove = () => {
    apply({ type: kind === 'area' ? 'deleteArea' : 'removeFromPlan', id: element.id });
    onGone(element.id);
  };

  const immediate = kind !== 'area';
  return (
    <div className="grid gap-4">
      {state.grabbed?.id === element.id && (
        <p role="status" className="text-muted-foreground flex items-start gap-2 text-sm">
          <InfoIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          Picked up. Arrow keys move it, Shift and arrow keys resize it, Space drops it, Escape
          cancels.
        </p>
      )}
      <form noValidate onSubmit={submitName} className="grid gap-2">
        <FormField
          id={NAME_FIELD_ID}
          label="Name"
          hint={immediate ? 'Saved right away.' : 'Saved with the layout.'}
          error={nameErr}
        >
          {(aria) => (
            <Input
              {...aria}
              autoComplete="off"
              value={name}
              disabled={off}
              onChange={(e) => {
                setName(e.target.value);
              }}
              onBlur={kind === 'area' ? submitName : undefined}
            />
          )}
        </FormField>
        {immediate && (
          <Button type="submit" variant="outline" size="sm" disabled={off} className="w-fit">
            {updateSeat.isPending || renameCubicle.isPending ? 'Saving…' : 'Rename'}
          </Button>
        )}
      </form>

      {kind === 'seat' && (
        <FormField id="item-cubicle" label="Cubicle" hint="Saved right away." error={undefined}>
          {(aria) => (
            <NativeSelect
              {...aria}
              aria-describedby={[aria['aria-describedby'], problem ? 'item-problem' : undefined]
                .filter(Boolean)
                .join(' ')}
              className="w-full"
              value={element.cubicleId ?? ''}
              disabled={off}
              onChange={(e) => {
                assign(e.target.value || null);
              }}
            >
              <NativeSelectOption value="">No cubicle</NativeSelectOption>
              {cubicles?.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
      )}
      {containing?.cubicleId && (
        <p className="text-muted-foreground text-sm">
          This seat is inside {labelOf(containing)}. Assign it?{' '}
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={off}
            onClick={() => {
              assign(containing.cubicleId ?? null);
            }}
          >
            Assign to {labelOf(containing)}
          </Button>
        </p>
      )}
      {problem && (
        <p id="item-problem" className="text-destructive flex items-start gap-2 text-sm">
          <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {kind === 'seat' && problem.startsWith('outside cubicle')
            ? `Seat ${labelOf(element)} is ${problem}. Move it inside, or choose No cubicle.`
            : `${KIND_LABEL[kind].charAt(0).toUpperCase()}${KIND_LABEL[kind].slice(1)} ${labelOf(element)} is ${problem}.`}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {NUMBER_FIELDS.map((f) => (
          <FormField
            key={f.key}
            id={f.id}
            label={f.label}
            hint={f.key === 'w' ? 'Squares across and down.' : undefined}
            error={numErr[f.key]}
          >
            {(aria) => (
              <Input
                {...aria}
                type="number"
                inputMode="numeric"
                min={1}
                value={nums[f.key]}
                disabled={off}
                onChange={(e) => {
                  setNums({ ...nums, [f.key]: e.target.value });
                }}
                onBlur={() => {
                  commitNumbers(f.key);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitNumbers(f.key);
                  }
                }}
              />
            )}
          </FormField>
        ))}
      </div>

      <div className="grid gap-2">
        <Button type="button" variant="outline" disabled={off} onClick={remove} className="w-fit">
          {kind === 'area' ? 'Delete area' : 'Remove from plan'}
        </Button>
        {kind !== 'area' && (
          <>
            <p className="text-muted-foreground text-sm">
              It stays in your seats and goes back to the list below.
            </p>
            <Button
              type="button"
              variant="ghost"
              disabled={off}
              className="text-destructive w-fit"
              onClick={() => {
                setConfirmDelete(true);
              }}
            >
              {kind === 'seat' ? 'Delete seat…' : 'Delete cubicle…'}
            </Button>
          </>
        )}
      </div>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(o) => {
          if (!o && !busy) setConfirmDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {kind === 'seat' ? 'seat ' : ''}
              {labelOf(element)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {kind === 'seat'
                ? 'It will no longer be listed or bookable. Bookings that ended keep its label.'
                : 'The cubicle and the seats in it will no longer be listed or bookable. Bookings that ended keep their labels.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              Keep {kind === 'seat' ? 'seat' : 'cubicle'}
            </AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                doDelete();
              }}
            >
              {busy ? 'Removing…' : `Remove ${kind === 'seat' ? 'seat' : 'cubicle'}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Selected item panel (ui/05 4): every plan operation as fields and buttons. */
export function LayoutItemForm(props: ItemFormProps) {
  const element = props.state.elements.find((e) => e.id === props.state.selectedId);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 id="item-heading">Selected item</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <section aria-labelledby="item-heading">
          {element ? (
            <Fields
              // Remount when the item changes or the plan moves it, so the fields show its geometry.
              key={`${element.id}:${String(element.x)},${String(element.y)},${String(element.w)},${String(element.h)}:${props.labelOf(element)}`}
              element={element}
              {...props}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              Select an item on the plan or in the list to edit it.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
