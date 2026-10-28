import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm';
import pg from 'pg';
import { PinoLogger } from 'nestjs-pino';

import { withSeatLocks, type SeatLockTx } from '../bookings/seat-lock.js';
import { alreadyOccupied, occupancyConflict } from '../common/errors/problem-types.js';
import { Clock } from '../common/time/clock.js';
import { addDays } from '../common/time/zoned-time.js';
import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import { occupancyMark, seat, seatHold, space } from '../db/schema/index.js';
import { dayBoundary, type OpeningHours } from '../marketplace/slots.js';
import type {
  ListOccupancyInput,
  MarkOccupiedInput,
  OccupancyMark,
  OccupancyMarkList,
} from './occupancy.schemas.js';

const EXCLUSION_VIOLATION = '23P01';
const DEADLOCK_DETECTED = '40P01';
const LOCK_NOT_AVAILABLE = '55P03';

type Conflict = Parameters<typeof occupancyConflict>[0][number];

function pgError(err: unknown): pg.DatabaseError | null {
  return err instanceof DrizzleQueryError && err.cause instanceof pg.DatabaseError
    ? err.cause
    : null;
}

const hhmm = (value: string | null): string => (value ?? '').slice(0, 5);

/** An incomplete draft has no hours yet: a mark then starts at midnight. */
function hoursOf(row: {
  openingMode: 'always_open' | 'fixed_hours' | null;
  shiftChangeAt: string | null;
  opensAt: string | null;
  closesAt: string | null;
}): OpeningHours {
  if (row.openingMode === 'always_open') {
    return { mode: 'always_open', shiftChangeAt: hhmm(row.shiftChangeAt) };
  }
  return {
    mode: 'fixed_hours',
    opensAt: hhmm(row.opensAt) || '00:00',
    closesAt: hhmm(row.closesAt),
  };
}

function toMark(
  mark: { id: string; startDate: string; endDate: string | null; note: string | null },
  seatRef: { id: string; label: string },
  hold: { startsAt: Date; endsAt: Date | null; active: boolean },
  now: Date,
): OccupancyMark {
  const live = hold.active && (hold.endsAt === null || hold.endsAt.getTime() > now.getTime());
  return {
    id: mark.id,
    seat: { id: seatRef.id, label: seatRef.label },
    startDate: mark.startDate,
    endDate: mark.endDate,
    note: mark.note,
    startsAt: hold.startsAt.toISOString(),
    endsAt: hold.endsAt === null ? null : hold.endsAt.toISOString(),
    status: live ? 'active' : 'ended',
  };
}

@Injectable()
export class OccupancyService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OccupancyService.name);
  }

  private async ownedSpace(ownerId: string, spaceId: string) {
    const [row] = await this.db
      .select({
        timeZone: space.timeZone,
        openingMode: space.openingMode,
        shiftChangeAt: space.shiftChangeAt,
        opensAt: space.opensAt,
        closesAt: space.closesAt,
      })
      .from(space)
      .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)));
    if (!row) throw new NotFoundException();
    return row;
  }

  /** Space row first, then the seat locks (the order deleteSeat and booking create use): no 40P01 between them. */
  private shareSpace(ownerId: string, spaceId: string) {
    return async (tx: SeatLockTx): Promise<void> => {
      const rows = await tx
        .select({ id: space.id })
        .from(space)
        .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)))
        .for('share');
      if (rows.length === 0) throw new NotFoundException();
    };
  }

  async list(
    ownerId: string,
    spaceId: string,
    query: ListOccupancyInput,
  ): Promise<OccupancyMarkList> {
    await this.ownedSpace(ownerId, spaceId);
    const now = this.clock.now();
    const rows = await this.db
      .select({
        mark: occupancyMark,
        seatId: seat.id,
        label: seat.label,
        startsAt: seatHold.startsAt,
        endsAt: seatHold.endsAt,
        active: seatHold.active,
      })
      .from(occupancyMark)
      .innerJoin(seat, eq(seat.id, occupancyMark.seatId))
      .innerJoin(seatHold, eq(seatHold.occupancyMarkId, occupancyMark.id))
      .where(
        and(
          eq(occupancyMark.spaceId, spaceId),
          isNull(seat.removedAt),
          eq(seatHold.active, true),
          sql`(${seatHold.endsAt} is null or ${seatHold.endsAt} > ${now.toISOString()}::timestamptz)`,
          query.seatId === undefined ? undefined : eq(occupancyMark.seatId, query.seatId),
        ),
      )
      .orderBy(asc(seatHold.startsAt), asc(seat.label), asc(occupancyMark.id));
    return {
      items: rows.map((r) => toMark(r.mark, { id: r.seatId, label: r.label }, r, now)),
    };
  }

  async mark(
    ownerId: string,
    spaceId: string,
    input: MarkOccupiedInput,
  ): Promise<OccupancyMarkList> {
    const sp = await this.ownedSpace(ownerId, spaceId);
    const hours = hoursOf(sp);
    const startsAt = dayBoundary(hours, input.startDate, sp.timeZone);
    const endsAt =
      input.endDate === null ? null : dayBoundary(hours, addDays(input.endDate, 1), sp.timeZone);
    const seatIds = [...new Set(input.seatIds)].sort();
    const note = input.note === null || input.note === '' ? null : input.note;
    const now = this.clock.now();

    try {
      const items = await withSeatLocks(
        this.db,
        seatIds,
        async (tx: SeatLockTx) => {
          const seats = await tx
            .select({ id: seat.id, label: seat.label })
            .from(seat)
            .innerJoin(space, eq(space.id, seat.spaceId))
            .where(
              and(
                inArray(seat.id, seatIds),
                eq(seat.spaceId, spaceId),
                isNull(seat.removedAt),
                eq(space.ownerId, ownerId),
              ),
            );
          // One generic 404: which ids missed may belong to someone else.
          if (new Set(seats.map((s) => s.id)).size !== seatIds.length)
            throw new NotFoundException();
          const labels = new Map(seats.map((s) => [s.id, s.label]));
          const marks = await tx
            .insert(occupancyMark)
            .values(
              seatIds.map((seatId) => ({
                spaceId,
                seatId,
                startDate: input.startDate,
                endDate: input.endDate,
                note,
                createdBy: ownerId,
              })),
            )
            .returning();
          await tx
            .insert(seatHold)
            .values(
              marks.map((m) => ({ seatId: m.seatId, occupancyMarkId: m.id, startsAt, endsAt })),
            );
          return marks
            .sort((a, b) => (a.seatId < b.seatId ? -1 : 1))
            .map((m) =>
              toMark(
                m,
                { id: m.seatId, label: labels.get(m.seatId) ?? '' },
                { startsAt, endsAt, active: true },
                now,
              ),
            );
        },
        {
          beforeLocks: this.shareSpace(ownerId, spaceId),
          classify: (err) => {
            const code = pgError(err)?.code;
            if (code === DEADLOCK_DETECTED) return 'retry';
            if (code === LOCK_NOT_AVAILABLE) return 'lock-timeout';
            return 'rethrow';
          },
          onRetry: (attempt) => {
            this.logger.warn({ spaceId, ownerId, attempt }, 'occupancy.deadlock-retry');
          },
          onLockTimeout: () => {
            this.logger.warn({ spaceId, ownerId }, 'occupancy.lock-timeout');
          },
        },
      );
      this.logger.info({ spaceId, ownerId, markIds: items.map((i) => i.id) }, 'occupancy.marked');
      items.sort((a, b) => a.seat.label.localeCompare(b.seat.label, 'en', { numeric: true }));
      return { items };
    } catch (err) {
      if (pgError(err)?.code === EXCLUSION_VIOLATION) {
        await this.throwConflict(seatIds, startsAt, endsAt, err);
      }
      throw err;
    }
  }

  /** After the rollback: what overlaps each requested seat, as dates and ranges, never identities. */
  private async throwConflict(
    seatIds: string[],
    startsAt: Date,
    endsAt: Date | null,
    original: unknown,
  ): Promise<never> {
    const { rows } = await this.db.execute<{
      seat_id: string;
      label: string;
      booked_date: string | null;
      mark_id: string | null;
      mark_start: string | null;
      mark_end: string | null;
    }>(sql`
      SELECT h.seat_id, s.label,
             to_char(h.service_date, 'YYYY-MM-DD') AS booked_date,
             h.occupancy_mark_id AS mark_id,
             to_char(m.start_date, 'YYYY-MM-DD') AS mark_start,
             to_char(m.end_date, 'YYYY-MM-DD') AS mark_end
      FROM seat_hold h
      JOIN seat s ON s.id = h.seat_id
      LEFT JOIN occupancy_mark m ON m.id = h.occupancy_mark_id
      WHERE h.seat_id = ANY(${sql.param(seatIds)}::uuid[])
        AND h.active
        AND tstzrange(h.starts_at, h.ends_at, '[)')
            && tstzrange(${startsAt.toISOString()}::timestamptz, ${endsAt === null ? null : endsAt.toISOString()}::timestamptz, '[)')
      ORDER BY s.label, h.starts_at
    `);
    const bySeat = new Map<string, Conflict>();
    let booked = false;
    for (const r of rows) {
      const c = bySeat.get(r.seat_id) ?? {
        seatId: r.seat_id,
        label: r.label,
        bookedDates: [],
        marks: [],
      };
      if (r.mark_id === null) {
        booked = true;
        if (r.booked_date !== null && !c.bookedDates.includes(r.booked_date)) {
          c.bookedDates.push(r.booked_date);
        }
      } else if (r.mark_start !== null) {
        c.marks.push({ id: r.mark_id, startDate: r.mark_start, endDate: r.mark_end });
      }
      bySeat.set(r.seat_id, c);
    }
    const [first, ...rest] = [...bySeat.values()];
    // The rival hold vanished (cancelled) between the failure and this read: nothing to report.
    if (!first) throw original;
    throw booked ? occupancyConflict([first, ...rest]) : alreadyOccupied([first, ...rest]);
  }

  /** Idempotent. A started mark ends now; one that has not started is switched off (R-11, AC 5.2). */
  async end(ownerId: string, spaceId: string, markId: string): Promise<OccupancyMark> {
    const [found] = await this.db
      .select({ seatId: occupancyMark.seatId })
      .from(occupancyMark)
      .innerJoin(space, eq(space.id, occupancyMark.spaceId))
      .where(
        and(
          eq(occupancyMark.id, markId),
          eq(occupancyMark.spaceId, spaceId),
          eq(space.ownerId, ownerId),
        ),
      );
    if (!found) throw new NotFoundException();
    const now = this.clock.now();
    const out = await withSeatLocks(
      this.db,
      [found.seatId],
      async (tx) => {
        const [row] = await tx
          .select({
            mark: occupancyMark,
            label: seat.label,
            holdId: seatHold.id,
            startsAt: seatHold.startsAt,
            endsAt: seatHold.endsAt,
            active: seatHold.active,
          })
          .from(occupancyMark)
          .innerJoin(seat, eq(seat.id, occupancyMark.seatId))
          .innerJoin(seatHold, eq(seatHold.occupancyMarkId, occupancyMark.id))
          .where(eq(occupancyMark.id, markId))
          .for('update', { of: [seatHold, occupancyMark] });
        if (!row) throw new NotFoundException();
        let hold = { startsAt: row.startsAt, endsAt: row.endsAt, active: row.active };
        const live = row.active && (row.endsAt === null || row.endsAt.getTime() > now.getTime());
        if (live) {
          const started = row.startsAt.getTime() < now.getTime();
          hold = started ? { ...hold, endsAt: now } : { ...hold, active: false };
          await tx
            .update(seatHold)
            .set(started ? { endsAt: now } : { active: false })
            .where(eq(seatHold.id, row.holdId));
          await tx
            .update(occupancyMark)
            .set({ endedAt: now })
            .where(and(eq(occupancyMark.id, markId), isNull(occupancyMark.endedAt)));
        }
        return {
          ended: live,
          mark: toMark(row.mark, { id: row.mark.seatId, label: row.label }, hold, now),
        };
      },
      {
        beforeLocks: this.shareSpace(ownerId, spaceId),
        classify: (err) => {
          const code = pgError(err)?.code;
          if (code === DEADLOCK_DETECTED) return 'retry';
          if (code === LOCK_NOT_AVAILABLE) return 'lock-timeout';
          return 'rethrow';
        },
        onLockTimeout: () => {
          this.logger.warn({ spaceId, ownerId, markId }, 'occupancy.lock-timeout');
        },
      },
    );
    if (out.ended) this.logger.info({ spaceId, ownerId, markId }, 'occupancy.ended');
    return out.mark;
  }
}
