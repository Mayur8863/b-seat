'use client';

import {
  type OccupancyMark,
  type OwnerSeat,
  useOccupancyList,
  useOwnerSpacesGet,
} from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Checkbox } from '@bseat/ui/components/checkbox';
import { toast } from '@bseat/ui/components/sonner';
import { ChevronDownIcon, LockIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { type EndTarget, MarkVacantDialog } from '@/components/mark-vacant-dialog';
import { MarkOccupiedPanel } from '@/components/mark-occupied-panel';
import { SeatList } from '@/components/seat-list';
import { SeatState } from '@/components/seat-state';
import { useSeatRefresh } from '@/components/use-seat-refresh';
import {
  checkState,
  EMPTY_SELECTION,
  formatMarkRange,
  type Selection,
  selectRange,
  toggleAll,
  toggleOne,
} from '@/lib/occupancy-values';
import { startDateRange } from '@/lib/seat-picker';

type ListProps = React.ComponentProps<typeof SeatList>;

const selectId = (id: string) => `seat-select-${id}`;
const marksButtonId = (id: string) => `seat-occupancy-${id}`;
const vacantId = (id: string) => `seat-vacant-${id}`;
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The seats list with today's state, selection, marking occupied and the marks per seat (ui/04 2). */
export function OccupancySeatList(props: ListProps) {
  const { spaceId, seats } = props;
  const space = useOwnerSpacesGet(spaceId);
  const marksQuery = useOccupancyList(spaceId);
  const refresh = useSeatRefresh(spaceId);
  const timeZone = space.data?.data.timeZone ?? 'UTC';
  const today = startDateRange(timeZone).min;
  const marks = marksQuery.data?.data.items;

  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [panelOpen, setPanelOpen] = useState(false);
  const [target, setTarget] = useState<EndTarget | null>(null);
  const [open, setOpen] = useState<string[]>([]);
  const [announce, setAnnounce] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const markButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<EndTarget | null>(null);

  const ids = useMemo(() => (seats ?? []).map((s) => s.id), [seats]);
  // A seat that disappears from the list is dropped from the selection.
  const selected = ids.filter((id) => selection.selected.includes(id));
  const marksBySeat = useMemo(() => {
    const map = new Map<string, OccupancyMark[]>();
    for (const m of [...(marks ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate))) {
      map.set(m.seat.id, [...(map.get(m.seat.id) ?? []), m]);
    }
    return map;
  }, [marks]);

  // Focus returns once the refreshed marks no longer list the ended one (ui/04 2.2).
  useEffect(() => {
    const p = pendingFocus.current;
    if (!p || !marks || !seats || marks.some((m) => m.id === p.markId)) return;
    pendingFocus.current = null;
    const first = seats[0];
    const id = [vacantId(p.seatId), marksButtonId(p.seatId), first ? selectId(first.id) : ''].find(
      (candidate) => candidate !== '' && document.getElementById(candidate),
    );
    if (id) document.getElementById(id)?.focus();
  }, [marks, seats]);

  const toggleSeat = (id: string, shift: boolean) => {
    setSelection((s) => {
      const base = { ...s, selected: ids.filter((x) => s.selected.includes(x)) };
      return shift ? selectRange(base, ids, id) : toggleOne(base, id);
    });
  };

  const selectedSeats = (seats ?? []).filter((s) => selected.includes(s.id));

  const header = (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        Today means {today} in {timeZone}. Only you can see occupancy notes. Renters see a taken
        seat.
      </p>
      {marksQuery.isError && (
        <Alert variant="destructive" role="alert">
          <AlertTitle>We couldn&apos;t load occupancy details</AlertTitle>
          <AlertDescription>
            <p>Try again in a moment.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void marksQuery.refetch()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div role="group" aria-label="Seat selection" className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 max-sm:min-h-11">
          <Checkbox
            checked={checkState(selected, ids)}
            onCheckedChange={() => {
              setSelection(toggleAll(selected, ids));
            }}
            aria-label={`Select all ${ids.length} seats`}
          />
          <span aria-hidden="true">Select all {ids.length} seats</span>
        </label>
        <p role="status" className="text-muted-foreground text-sm">
          {selected.length > 0 ? `${plural(selected.length, 'seat', 'seats')} selected` : ''}
        </p>
        {selected.length > 0 && (
          <>
            <Button
              ref={markButtonRef}
              type="button"
              onClick={() => {
                setPanelOpen(true);
              }}
              className="max-sm:min-h-11 max-sm:w-full"
            >
              <LockIcon aria-hidden="true" /> Mark occupied
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelection(EMPTY_SELECTION);
                setPanelOpen(false);
              }}
              className="max-sm:min-h-11 max-sm:w-full"
            >
              Clear selection
            </Button>
          </>
        )}
      </div>
      {announce && (
        <p role="status" className="text-sm">
          {announce}
        </p>
      )}
      {panelOpen && selectedSeats.length > 0 && (
        <MarkOccupiedPanel
          spaceId={spaceId}
          seats={selectedSeats}
          today={today}
          timeZone={timeZone}
          onCancel={() => {
            setPanelOpen(false);
            requestAnimationFrame(() => markButtonRef.current?.focus());
          }}
          onMarked={(n) => {
            toast.success(`${plural(n, 'seat', 'seats')} marked occupied`);
            setAnnounce(`${plural(n, 'seat', 'seats')} marked occupied.`);
            setSelection(EMPTY_SELECTION);
            setPanelOpen(false);
            refresh();
            requestAnimationFrame(() => headingRef.current?.focus());
          }}
        />
      )}
    </div>
  );

  const endTarget = (seat: OwnerSeat, m: OccupancyMark): EndTarget => ({
    markId: m.id,
    seatId: seat.id,
    seatLabel: seat.label,
    kind: m.startDate <= today ? 'vacant' : 'remove',
    range: sentence(formatMarkRange(m.startDate, m.endDate)),
  });

  return (
    <>
      <SeatList
        {...props}
        headingRef={headingRef}
        header={header}
        renderLead={(seat) => (
          <Checkbox
            id={selectId(seat.id)}
            aria-label={`Select seat ${seat.label}`}
            checked={selected.includes(seat.id)}
            // Click carries Shift for both Shift+click and Shift+Space (OQ-T46-3).
            onClick={(e) => {
              toggleSeat(seat.id, e.shiftKey);
            }}
            className="max-sm:size-5"
          />
        )}
        renderExtra={(seat) => {
          const list = marksBySeat.get(seat.id) ?? [];
          const isOpen = open.includes(seat.id);
          const { state, markId } = seat.today;
          return (
            <div className="grid gap-2 sm:flex sm:items-center sm:gap-3">
              <SeatState seat={seat} />
              {list.length > 0 && (
                <Button
                  id={marksButtonId(seat.id)}
                  type="button"
                  variant="link"
                  size="sm"
                  aria-expanded={isOpen}
                  aria-controls={`seat-marks-${seat.id}`}
                  onClick={() => {
                    setOpen((o) => (isOpen ? o.filter((x) => x !== seat.id) : [...o, seat.id]));
                  }}
                >
                  Occupancy ({list.length}
                  <span className="sr-only"> for seat {seat.label}</span>)
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={isOpen ? 'rotate-180' : undefined}
                  />
                </Button>
              )}
              {state === 'occupied' && markId && (
                <Button
                  id={vacantId(seat.id)}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setTarget({
                      markId,
                      seatId: seat.id,
                      seatLabel: seat.label,
                      kind: 'vacant',
                      range: '',
                    });
                  }}
                >
                  Mark vacant <span className="sr-only">seat {seat.label}</span>
                </Button>
              )}
            </div>
          );
        }}
        renderBelow={(seat) => {
          const list = marksBySeat.get(seat.id) ?? [];
          if (!open.includes(seat.id) || list.length === 0) return null;
          return (
            <ul
              id={`seat-marks-${seat.id}`}
              aria-label={`Occupancy for seat ${seat.label}`}
              className="grid gap-2 border-t px-3 py-2 text-sm"
            >
              {list.map((m) => {
                const t = endTarget(seat, m);
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-2">
                    <span>{t.range}</span>
                    <span className="font-medium">
                      {t.kind === 'vacant' ? 'Current' : 'Upcoming'}
                    </span>
                    {m.note && (
                      <span className="text-muted-foreground break-words">Note: {m.note}</span>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setTarget(t);
                      }}
                    >
                      {t.kind === 'vacant' ? 'Mark vacant ' : 'Remove '}
                      <span className="sr-only">{`seat ${seat.label}, ${t.range}`}</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          );
        }}
      />
      <MarkVacantDialog
        spaceId={spaceId}
        target={target}
        onClose={() => {
          setTarget(null);
        }}
        onEnded={(t) => {
          pendingFocus.current = t;
          setTarget(null);
        }}
        onPageProblem={props.onPageProblem}
      />
    </>
  );
}
