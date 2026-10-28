'use client';

import { useOwnerSeatsCreateCubicle, useOwnerSeatsCreateSeats } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@bseat/ui/components/card';
import { Input } from '@bseat/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@bseat/ui/components/native-select';
import { toast } from '@bseat/ui/components/sonner';
import { useEffect, useRef, useState } from 'react';

import { FormField } from '@/components/space-form/form-field';
import type { PlaceRequest } from '@/components/unplaced-tray';
import type { ProblemCopy } from '@/lib/problem-copy';
import { describeSeatProblem } from '@/lib/seat-problems';

type Kind = 'seat' | 'cubicle' | 'area';
const MAX = { seat: 20, cubicle: 100, area: 40 } as const;
const HINT = {
  seat: 'Seat label, up to 20 characters.',
  cubicle: 'Cubicle name, up to 100 characters.',
  area: 'Area name, for example Meeting room. Up to 40 characters.',
} as const;
const TITLE = { seat: 'Seat', cubicle: 'Cubicle', area: 'Area' } as const;

interface Props {
  spaceId: string;
  seatCount: number;
  refresh: () => void;
  /** Places the new item; false when the grid has no free space. */
  onPlace: (kind: Kind, request: Omit<PlaceRequest, 'kind'>) => boolean;
  disabled: boolean;
}

/** "Add to the plan" (ui/05 5.1): creates seats and cubicles through their endpoints, areas in the draft. */
export function LayoutAddForm({ spaceId, seatCount, refresh, onPlace, disabled }: Props) {
  const [kind, setKind] = useState<Kind>('seat');
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [alert, setAlert] = useState<ProblemCopy | null>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const createSeats = useOwnerSeatsCreateSeats();
  const createCubicle = useOwnerSeatsCreateCubicle();
  const pending = createSeats.isPending || createCubicle.isPending;
  useEffect(() => {
    if (alert) alertRef.current?.focus();
  }, [alert]);

  const placed = (ref: string, label: string) => {
    if (!onPlace(kind, { ref, label })) {
      setAlert({
        title: 'No free space on the grid',
        description: ['Make the grid bigger or move items, then add it again.'],
      });
      return;
    }
    setName('');
    toast.success(`${TITLE[kind]} ${label} added`);
  };

  const submit = (ev: { preventDefault: () => void }) => {
    ev.preventDefault();
    const value = name.trim();
    setAlert(null);
    const invalid = !value
      ? 'Enter a name'
      : value.length > MAX[kind]
        ? `Use ${String(MAX[kind])} characters or fewer`
        : undefined;
    setError(invalid);
    if (invalid) return;
    const fail = (e: unknown) => {
      const p = describeSeatProblem(e, kind === 'seat' ? 'add one' : 'add cubicle', {
        label: value,
        name: value,
        current: seatCount,
      });
      if (p.field) setError(p.field);
      else if (p.alert) setAlert(p.alert);
    };
    if (kind === 'area') {
      placed(`area-${crypto.randomUUID()}`, value);
    } else if (kind === 'seat') {
      createSeats.mutate(
        { spaceId, data: { seats: [{ label: value }] } },
        {
          onSuccess: (res) => {
            refresh();
            const seat = res.data.items.find((s) => s.label === value) ?? res.data.items[0];
            if (seat) placed(seat.id, seat.label);
          },
          onError: fail,
        },
      );
    } else {
      createCubicle.mutate(
        { spaceId, data: { name: value } },
        {
          onSuccess: (res) => {
            refresh();
            placed(res.data.id, res.data.name);
          },
          onError: fail,
        },
      );
    }
  };

  const off = disabled || pending;
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Add to the plan</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form noValidate onSubmit={submit} className="grid gap-3">
          {alert && (
            <Alert variant="destructive" role="alert" ref={alertRef} tabIndex={-1}>
              <AlertTitle>{alert.title}</AlertTitle>
              <AlertDescription>
                {alert.description.map((p) => (typeof p === 'string' ? p : p.text))}
              </AlertDescription>
            </Alert>
          )}
          <FormField id="add-type" label="Type">
            {(aria) => (
              <NativeSelect
                {...aria}
                className="w-full"
                value={kind}
                disabled={off}
                onChange={(e) => {
                  setKind(e.target.value as Kind);
                  setError(undefined);
                }}
              >
                <NativeSelectOption value="seat">Seat</NativeSelectOption>
                <NativeSelectOption value="cubicle">Cubicle</NativeSelectOption>
                <NativeSelectOption value="area">Area</NativeSelectOption>
              </NativeSelect>
            )}
          </FormField>
          <FormField id="add-name" label="Name" hint={HINT[kind]} error={error}>
            {(aria) => (
              <Input
                {...aria}
                autoComplete="off"
                value={name}
                disabled={off}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
            )}
          </FormField>
          <Button type="submit" disabled={off} className="w-fit">
            {pending ? 'Adding…' : 'Add'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
