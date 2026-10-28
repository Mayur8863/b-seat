'use client';

import {
  ApiError,
  type Calendar,
  type CalendarChange,
  getCalendarsListQueryKey,
  useCalendarsList,
  useCalendarsPutShared,
  useCalendarsPutSeat,
  useCalendarsRemoveSeat,
  useOwnerSeatsListSeats,
  useOwnerSpacesGet,
} from '@bseat/api-client';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@bseat/ui/components/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Card, CardContent } from '@bseat/ui/components/card';
import { NativeSelect, NativeSelectOption } from '@bseat/ui/components/native-select';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { toast } from '@bseat/ui/components/sonner';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheckIcon, InfoIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useRef, useState } from 'react';

import { CalendarForm } from '@/components/calendar-form';
import { FormField } from '@/components/space-form/form-field';
import { useSeatRefresh } from '@/components/use-seat-refresh';
import { calendarSummary, outsideNotice, PRESETS } from '@/lib/calendar-values';
import { describeOwnerProblem } from '@/lib/marketplace-problems';
import type { ProblemCopy } from '@/lib/problem-copy';
import { startDateRange } from '@/lib/seat-picker';

const seatFieldId = 'availability-add-seat';
const editButtonId = (id: string) => `availability-edit-${id}`;
const focusLater = (id: string) => {
  requestAnimationFrame(() => document.getElementById(id)?.focus());
};

function OutsideNotice({ count, spaceId }: { count: number; spaceId: string }) {
  if (count <= 0) return null;
  return (
    <Alert role="status">
      <InfoIcon aria-hidden="true" />
      <AlertTitle>{outsideNotice(count)}</AlertTitle>
      <AlertDescription>
        <p>They stay valid. Renters keep those days, and no booking was cancelled.</p>
        <Link
          href={`/owner/spaces/${spaceId}/bookings` as Route}
          className="text-primary underline underline-offset-4"
        >
          View bookings
        </Link>
      </AlertDescription>
    </Alert>
  );
}

function SharedCard({
  spaceId,
  shared,
  onChanged,
}: {
  spaceId: string;
  shared: Calendar;
  onChanged: () => void;
}) {
  const put = useCalendarsPutShared();
  const [problem, setProblem] = useState<ProblemCopy | null>(null);
  const [saved, setSaved] = useState<CalendarChange | null>(null);
  return (
    <Card>
      <CardContent className="grid gap-4">
        <h2 className="text-lg font-semibold">Shared calendar</h2>
        <p className="text-muted-foreground text-sm">
          Applies to every seat that doesn&apos;t have its own calendar.
        </p>
        <CalendarForm
          idPrefix="shared"
          initial={shared}
          submitLabel="Save shared calendar"
          pending={put.isPending}
          problem={problem}
          onChange={() => {
            setSaved(null);
          }}
          onUnchanged={() => {
            setSaved({ calendar: shared, bookingsOutsideCalendar: 0 });
          }}
          onSubmit={(data) => {
            setProblem(null);
            put.mutate(
              { spaceId, data },
              {
                onSuccess: (res) => {
                  setSaved(res.data);
                  onChanged();
                },
                onError: (e) => {
                  setProblem(describeOwnerProblem(e, 'save the calendar'));
                },
              },
            );
          }}
        />
        <div role="status" className="grid gap-3">
          {saved && (
            <>
              <p className="text-success flex items-center gap-2 text-sm">
                <CircleCheckIcon aria-hidden="true" className="size-4" /> Calendar saved
              </p>
              <OutsideNotice count={saved.bookingsOutsideCalendar} spaceId={spaceId} />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface OwnSeat {
  seatId: string;
  label: string;
  calendar: Calendar;
}

function OwnCalendars({
  spaceId,
  shared,
  own,
  sharedSeats,
  hasSeats,
  onChanged,
}: {
  spaceId: string;
  shared: Calendar;
  own: OwnSeat[];
  sharedSeats: { id: string; label: string }[];
  hasSeats: boolean;
  onChanged: () => void;
}) {
  const put = useCalendarsPutSeat();
  const remove = useCalendarsRemoveSeat();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState('');
  const [chooseError, setChooseError] = useState<string>();
  const [problem, setProblem] = useState<ProblemCopy | null>(null);
  const [outside, setOutside] = useState(0);
  const [removing, setRemoving] = useState<OwnSeat | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const save = (seat: { id: string; label: string }, data: Calendar, created: boolean) => {
    setProblem(null);
    put.mutate(
      { spaceId, seatId: seat.id, data },
      {
        onSuccess: (res) => {
          setOutside(res.data.bookingsOutsideCalendar);
          setEditing(null);
          setAdding(false);
          setChosen('');
          if (created) toast.success(`Seat ${seat.label} has its own calendar`);
          onChanged();
          focusLater(editButtonId(seat.id));
        },
        onError: (e) => {
          setProblem(describeOwnerProblem(e, 'save the calendar'));
        },
      },
    );
  };

  const chosenSeat = sharedSeats.find((s) => s.id === chosen);
  return (
    <section aria-labelledby="own-heading" className="grid gap-4">
      <h2 id="own-heading" ref={headingRef} tabIndex={-1} className="text-lg font-semibold">
        Seats with their own calendar
      </h2>
      <p className="text-muted-foreground text-sm">These seats ignore the shared calendar.</p>
      <div role="status" className="grid gap-3">
        <OutsideNotice count={outside} spaceId={spaceId} />
      </div>
      {own.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No seats have their own calendar. The shared calendar applies to all of them.
        </p>
      ) : (
        <ul
          aria-label="Seats with their own calendar"
          className="bg-card divide-y rounded-xl border"
        >
          {own.map((s) => (
            <li key={s.seatId} className="grid gap-3 p-4">
              {editing === s.seatId ? (
                <>
                  <p className="font-medium">{s.label}</p>
                  <CalendarForm
                    idPrefix={`seat-${s.seatId}`}
                    initial={s.calendar}
                    submitLabel="Save calendar"
                    pending={put.isPending}
                    problem={problem}
                    focusStart
                    onCancel={() => {
                      setEditing(null);
                      setProblem(null);
                      focusLater(editButtonId(s.seatId));
                    }}
                    onUnchanged={() => {
                      setEditing(null);
                      toast.success('Calendar saved');
                      focusLater(editButtonId(s.seatId));
                    }}
                    onSubmit={(data) => {
                      save({ id: s.seatId, label: s.label }, data, false);
                    }}
                  />
                </>
              ) : (
                <div className="grid gap-3 sm:flex sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{s.label}</p>
                    <p className="text-muted-foreground text-sm">{calendarSummary(s.calendar)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      id={editButtonId(s.seatId)}
                      aria-label={`Edit calendar for seat ${s.label}`}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setProblem(null);
                        setEditing(s.seatId);
                      }}
                    >
                      Edit calendar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Use shared calendar for seat ${s.label}`}
                      onClick={() => {
                        setProblem(null);
                        setRemoving(s);
                      }}
                    >
                      Use shared calendar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Card>
        <CardContent className="grid gap-4">
          <h3 className="text-base font-medium">Give a seat its own calendar</h3>
          {!hasSeats ? (
            <p className="text-muted-foreground text-sm">
              Add seats first.{' '}
              <Link
                href={`/owner/spaces/${spaceId}/seats` as Route}
                className="text-primary underline underline-offset-4"
              >
                Go to seats
              </Link>
            </p>
          ) : sharedSeats.length === 0 ? (
            <p className="text-muted-foreground text-sm">Every seat has its own calendar.</p>
          ) : (
            <>
              <FormField
                id={seatFieldId}
                label="Seat"
                hint="The seat leaves the shared calendar."
                error={chooseError}
              >
                {(aria) => (
                  <NativeSelect
                    {...aria}
                    value={chosen}
                    disabled={adding}
                    onChange={(e) => {
                      setChosen(e.target.value);
                      setChooseError(undefined);
                    }}
                  >
                    <NativeSelectOption value="">Choose a seat</NativeSelectOption>
                    {sharedSeats.map((s) => (
                      <NativeSelectOption key={s.id} value={s.id}>
                        {s.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              {!adding && (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (!chosenSeat) {
                        setChooseError('Choose a seat.');
                        return;
                      }
                      setProblem(null);
                      setAdding(true);
                    }}
                  >
                    Set up calendar
                  </Button>
                </div>
              )}
              {adding && chosenSeat && (
                <CalendarForm
                  idPrefix="add"
                  initial={shared}
                  submitLabel="Save seat calendar"
                  pending={put.isPending}
                  problem={problem}
                  focusStart
                  onCancel={() => {
                    setAdding(false);
                    setProblem(null);
                    focusLater(seatFieldId);
                  }}
                  onSubmit={(data) => {
                    save(chosenSeat, data, true);
                  }}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
      <AlertDialog
        open={removing !== null}
        onOpenChange={(o) => {
          if (!o && !remove.isPending) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Use the shared calendar for seat {removing?.label}?</AlertDialogTitle>
            <AlertDialogDescription>
              The seat&apos;s own calendar is removed and the shared calendar applies. Bookings that
              already exist stay valid.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {problem && removing && (
            <Alert variant="destructive" role="alert">
              <AlertTitle>{problem.title}</AlertTitle>
              <AlertDescription>
                <p>{problem.description.map((p) => (typeof p === 'string' ? p : p.text))}</p>
              </AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep own calendar</AlertDialogCancel>
            <Button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                if (!removing) return;
                const seat = removing;
                remove.mutate(
                  { spaceId, seatId: seat.seatId },
                  {
                    onSuccess: (res) => {
                      setRemoving(null);
                      setProblem(null);
                      setOutside(res.data.bookingsOutsideCalendar);
                      toast.success(`Seat ${seat.label} uses the shared calendar`);
                      onChanged();
                      focusLater(
                        sharedSeats.length > 0 || own.length > 0 ? seatFieldId : 'own-heading',
                      );
                    },
                    onError: (e) => {
                      setProblem(describeOwnerProblem(e, "switch that seat's calendar"));
                    },
                  },
                );
              }}
            >
              {remove.isPending ? 'Switching…' : 'Use shared calendar'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Availability page: the shared calendar and per-seat calendars (ui/04 3). */
export function AvailabilityView({ spaceId }: { spaceId: string }) {
  const calendars = useCalendarsList(spaceId);
  const seatsQuery = useOwnerSeatsListSeats(spaceId);
  const space = useOwnerSpacesGet(spaceId);
  const queryClient = useQueryClient();
  const refreshSeats = useSeatRefresh(spaceId);
  const timeZone = space.data?.data.timeZone ?? 'UTC';
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: getCalendarsListQueryKey(spaceId) });
    refreshSeats();
  };

  const intro = (
    <>
      <h1 className="text-2xl font-semibold">Availability</h1>
      <p className="text-muted-foreground text-sm">
        Choose when seats can be booked. One shared calendar applies to every seat unless a seat has
        its own.
      </p>
      <p className="text-muted-foreground text-sm">Dates are in {timeZone}.</p>
    </>
  );

  if (calendars.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true">
        {intro}
        <p role="status" className="sr-only">
          Loading availability…
        </p>
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  }

  if (calendars.isError) {
    const missing = calendars.error instanceof ApiError && calendars.error.status === 404;
    if (missing) {
      // The space has no shared calendar; saving one repairs it (T051).
      const fallback: Calendar = {
        startDate: startDateRange(timeZone).min,
        endDate: null,
        weekdays: [...PRESETS.everyDay],
      };
      return (
        <div className="grid gap-4">
          {intro}
          <Alert variant="destructive" role="alert">
            <AlertTitle>This space has no shared calendar</AlertTitle>
            <AlertDescription>
              <p>Set one below. Seats can be booked once it is saved.</p>
            </AlertDescription>
          </Alert>
          <SharedCard spaceId={spaceId} shared={fallback} onChanged={refresh} />
        </div>
      );
    }
    return (
      <div className="grid gap-4">
        {intro}
        <Alert variant="destructive" role="alert">
          <AlertTitle>We couldn&apos;t load availability</AlertTitle>
          <AlertDescription>
            <p>Try again in a moment.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void calendars.refetch()}
            >
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { shared, seats: own } = calendars.data.data;
  const ownSorted = [...own].sort((a, b) => a.label.localeCompare(b.label));
  const allSeats = seatsQuery.data?.data.items ?? [];
  const sharedSeats = allSeats.filter((s) => s.calendar === 'shared');

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">{intro}</div>
      <SharedCard spaceId={spaceId} shared={shared} onChanged={refresh} />
      <OwnCalendars
        spaceId={spaceId}
        shared={shared}
        own={ownSorted}
        sharedSeats={sharedSeats}
        hasSeats={allSeats.length > 0 || own.length > 0}
        onChanged={refresh}
      />
    </div>
  );
}
