'use client';

import type { ListingLayout, ListingSeatAvailabilitySeatsItem as Seat } from '@bseat/api-client';
import { BanIcon, CalendarXIcon, CheckIcon, CircleCheckIcon } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';

import { formatLocalDate } from '@/lib/booking-format';
import { type Direction, nearestFree, type PlanSeat, readingOrder } from '@/lib/plan-nav';

const MIN_CELL = 24;
const MAX_CELL = 40;

const KEYS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** A plan seat joined to its availability; seats missing from the response are dropped. */
export interface PlacedSeat extends PlanSeat {
  seat: Seat;
}

export function placeSeats(layout: ListingLayout, seats: Seat[]): PlacedSeat[] {
  const byId = new Map(seats.map((s) => [s.id, s]));
  return layout.elements.flatMap((e) => {
    const seat = e.seatId ? byId.get(e.seatId) : undefined;
    return e.kind === 'seat' && seat
      ? [{ id: seat.id, x: e.x, y: e.y, w: e.w, h: e.h, free: seat.status === 'free', seat }]
      : [];
  });
}

function stateWord(seat: Seat, startDate: string): string {
  if (seat.status === 'free') return 'Free';
  if (seat.status === 'taken') return 'Taken';
  return `Closed on ${formatLocalDate(startDate)}`;
}

/** Read-only floor plan (ui/05 8.2). Selection is reported by seat id; the parent owns it. */
export function ListingPlan({
  layout,
  seats,
  startDate,
  selectedSeatId,
  labelledBy,
  onSelect,
}: {
  layout: ListingLayout;
  seats: Seat[];
  startDate: string;
  selectedSeatId: string | null;
  labelledBy: string;
  onSelect: (seatId: string) => void;
}) {
  const regionRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(MIN_CELL);
  const refs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const el = regionRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const fit = () => {
      setCell(Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(el.clientWidth / layout.columns))));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, [layout.columns]);

  const placed = readingOrder(placeSeats(layout, seats));
  const selected = placed.find((p) => p.id === selectedSeatId && p.free);
  const firstFree = placed.find((p) => p.free);
  const tabStop = (selected ?? firstFree)?.id;
  const cubicles = layout.elements.filter((e) => e.kind === 'cubicle');
  const areas = layout.elements.filter((e) => e.kind === 'area');

  const choose = (id: string) => {
    onSelect(id);
    refs.current.get(id)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const dir = KEYS[e.key];
    const free = placed.filter((p) => p.free);
    let target: PlanSeat | undefined;
    if (dir) target = nearestFree(placed, id, dir);
    else if (e.key === 'Home') target = free[0];
    else if (e.key === 'End') target = free[free.length - 1];
    else return;
    e.preventDefault();
    if (target) choose(target.id);
  };

  const areaNames = areas.map((a) => a.label);

  return (
    <div className="grid gap-2">
      {areaNames.length > 0 && (
        <p className="sr-only">Areas on this plan: {areaNames.join(', ')}.</p>
      )}
      <div
        ref={regionRef}
        role="region"
        aria-label={`Floor plan, ${layout.columns} by ${layout.rows} squares`}
        className="bg-card max-h-[70vh] overflow-auto rounded-xl border"
      >
        <div
          role="radiogroup"
          aria-labelledby={labelledBy}
          className="relative"
          style={{
            width: layout.columns * cell,
            height: layout.rows * cell,
            backgroundImage:
              'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
            backgroundSize: `${cell}px ${cell}px`,
          }}
        >
          {[...cubicles, ...areas].map((e, i) => (
            <div
              key={`${e.kind}-${i}`}
              aria-hidden="true"
              className={`absolute z-0 overflow-hidden p-1 text-xs ${
                e.kind === 'cubicle'
                  ? 'bg-muted/40 text-muted-foreground border-muted-foreground rounded-lg border-2 border-dashed'
                  : 'bg-secondary text-secondary-foreground border-muted-foreground rounded-lg border font-medium'
              }`}
              style={{ left: e.x * cell, top: e.y * cell, width: e.w * cell, height: e.h * cell }}
            >
              {e.label}
            </div>
          ))}
          {placed.map((p) => {
            const isSelected = p.id === selected?.id;
            const word = stateWord(p.seat, startDate);
            const Icon = p.free
              ? CircleCheckIcon
              : p.seat.status === 'taken'
                ? BanIcon
                : CalendarXIcon;
            const cubicle = p.seat.cubicle ? `${p.seat.cubicle.name}, ` : '';
            return (
              <button
                key={p.id}
                ref={(el) => {
                  if (el) refs.current.set(p.id, el);
                  else refs.current.delete(p.id);
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-disabled={!p.free || undefined}
                aria-label={`${p.seat.label}, ${cubicle}${word}`}
                tabIndex={p.id === tabStop ? 0 : -1}
                onClick={() => {
                  if (p.free) choose(p.id);
                }}
                onKeyDown={(e) => {
                  onKeyDown(e, p.id);
                }}
                className={`focus-visible:outline-ring absolute z-10 flex items-center justify-center gap-1 rounded-md text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  isSelected
                    ? 'border-primary bg-primary/5 text-card-foreground border-2'
                    : p.free
                      ? 'border-muted-foreground bg-card text-card-foreground hover:bg-muted/50 border'
                      : 'border-muted-foreground bg-muted text-muted-foreground cursor-default border border-dashed'
                }`}
                style={{ left: p.x * cell, top: p.y * cell, width: p.w * cell, height: p.h * cell }}
              >
                {(p.w > 1 || p.h > 1) && <span className="truncate">{p.seat.label}</span>}
                <Icon
                  aria-hidden="true"
                  className={`size-4 shrink-0 ${p.free ? 'text-success' : ''}`}
                />
                {isSelected && (
                  <span
                    aria-hidden="true"
                    className="bg-primary text-primary-foreground absolute -top-1 -right-1 rounded-full p-0.5"
                  >
                    <CheckIcon className="size-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <ul
        aria-label="Legend"
        className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-2 text-sm"
      >
        <li className="flex items-center gap-1">
          <CircleCheckIcon aria-hidden="true" className="text-success size-4" />
          Free
        </li>
        <li className="flex items-center gap-1">
          <BanIcon aria-hidden="true" className="size-4" />
          Taken
        </li>
        <li className="flex items-center gap-1">
          <CalendarXIcon aria-hidden="true" className="size-4" />
          Closed
        </li>
        <li className="flex items-center gap-1">
          <span className="bg-primary text-primary-foreground rounded-full p-0.5">
            <CheckIcon aria-hidden="true" className="size-3" />
          </span>
          Selected
        </li>
      </ul>
    </div>
  );
}
