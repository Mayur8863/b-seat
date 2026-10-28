import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { naturalSeatOrder } from '../marketplace/seat-order.js';
import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';

import { withLockTimeout } from '../bookings/seat-lock.js';
import { Clock } from '../common/time/clock.js';
import { toLocal } from '../common/time/zoned-time.js';
import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import { availabilityCalendar, booking, seat, seatHold, space } from '../db/schema/index.js';
import {
  type Calendar as RuleCalendar,
  isOpen,
  weekdayMask,
  weekdaysOf,
} from '../marketplace/calendar-rules.js';
import type {
  Calendar,
  CalendarChange,
  CalendarInput,
  SpaceCalendars,
} from './calendars.schemas.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type CalendarRow = typeof availabilityCalendar.$inferSelect;

// Fail closed: a space without a shared calendar offers no open day (T004 review).
const CLOSED: RuleCalendar = { startDate: '0001-01-01', endDate: null, weekdays: 0 };

const toCalendar = (row: Pick<CalendarRow, 'startDate' | 'endDate' | 'weekdays'>): Calendar => ({
  startDate: row.startDate,
  endDate: row.endDate,
  weekdays: weekdaysOf(row.weekdays),
});

@Injectable()
export class CalendarsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CalendarsService.name);
  }

  /**
   * Locks the caller's space row, so calendar writes of one space queue. Calendar changes touch no
   * holds or bookings, so there are no seat locks to order after it (ADR-0009 section 9).
   */
  private async lockSpace(tx: Tx, ownerId: string, spaceId: string): Promise<string> {
    const [row] = await withLockTimeout(tx, this.logger, { spaceId }, () =>
      tx
        .select({ timeZone: space.timeZone })
        .from(space)
        .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)))
        .for('update'),
    );
    if (!row) throw new NotFoundException();
    return row.timeZone;
  }

  private async activeSeat(tx: Tx, spaceId: string, seatId: string): Promise<void> {
    const rows = await tx
      .select({ id: seat.id })
      .from(seat)
      .where(and(eq(seat.id, seatId), eq(seat.spaceId, spaceId), isNull(seat.removedAt)));
    if (rows.length === 0) throw new NotFoundException();
  }

  /**
   * Active pass bookings that have not ended, with a live occurrence from today on that the
   * calendar closes. Earlier occurrences are already served, so they are not counted.
   */
  private async countOutside(
    tx: Tx,
    timeZone: string,
    seatIds: string[],
    calendarOf: (seatId: string) => RuleCalendar,
  ): Promise<number> {
    if (seatIds.length === 0) return 0;
    const today = toLocal(this.clock.now(), timeZone).date;
    const rows = await tx
      .select({
        bookingId: seatHold.bookingId,
        seatId: seatHold.seatId,
        serviceDate: seatHold.serviceDate,
      })
      .from(seatHold)
      .innerJoin(booking, eq(booking.id, seatHold.bookingId))
      .where(
        and(
          inArray(seatHold.seatId, seatIds),
          eq(seatHold.active, true),
          eq(booking.kind, 'pass'),
          eq(booking.status, 'active'),
          gte(booking.endDate, today),
          gte(seatHold.serviceDate, today),
        ),
      );
    const outside = new Set<string>();
    for (const r of rows) {
      if (r.bookingId && r.serviceDate && !isOpen(calendarOf(r.seatId), r.serviceDate)) {
        outside.add(r.bookingId);
      }
    }
    return outside.size;
  }

  private async sharedRow(tx: Tx | Database, spaceId: string): Promise<CalendarRow | null> {
    const [row] = await tx
      .select()
      .from(availabilityCalendar)
      .where(and(eq(availabilityCalendar.spaceId, spaceId), isNull(availabilityCalendar.seatId)));
    return row ?? null;
  }

  async list(ownerId: string, spaceId: string): Promise<SpaceCalendars> {
    const owned = await this.db
      .select({ id: space.id })
      .from(space)
      .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)));
    if (owned.length === 0) throw new NotFoundException();
    const shared = await this.sharedRow(this.db, spaceId);
    // A missing shared calendar is never invented; PUT …/calendars/shared repairs it.
    if (!shared) throw new NotFoundException();
    const rows = await this.db
      .select({
        seatId: seat.id,
        label: seat.label,
        startDate: availabilityCalendar.startDate,
        endDate: availabilityCalendar.endDate,
        weekdays: availabilityCalendar.weekdays,
      })
      .from(availabilityCalendar)
      .innerJoin(seat, eq(seat.id, availabilityCalendar.seatId))
      .where(and(eq(availabilityCalendar.spaceId, spaceId), isNull(seat.removedAt)))
      .orderBy(...naturalSeatOrder(), asc(seat.id));
    return {
      shared: toCalendar(shared),
      seats: rows.map((r) => ({ seatId: r.seatId, label: r.label, calendar: toCalendar(r) })),
    };
  }

  async putShared(ownerId: string, spaceId: string, input: CalendarInput): Promise<CalendarChange> {
    const values = {
      startDate: input.startDate,
      endDate: input.endDate,
      weekdays: weekdayMask(input.weekdays),
    };
    const out = await this.db.transaction(async (tx) => {
      const timeZone = await this.lockSpace(tx, ownerId, spaceId);
      const existing = await this.sharedRow(tx, spaceId);
      if (existing) {
        await tx
          .update(availabilityCalendar)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(availabilityCalendar.id, existing.id));
      } else {
        await tx.insert(availabilityCalendar).values({ spaceId, ...values });
      }
      const ownRows = await tx
        .select({ seatId: availabilityCalendar.seatId })
        .from(availabilityCalendar)
        .where(eq(availabilityCalendar.spaceId, spaceId));
      const hasOwn = new Set(ownRows.map((r) => r.seatId));
      const seats = await tx
        .select({ id: seat.id })
        .from(seat)
        .where(and(eq(seat.spaceId, spaceId), isNull(seat.removedAt)));
      const onShared = seats.map((s) => s.id).filter((id) => !hasOwn.has(id));
      const bookingsOutsideCalendar = await this.countOutside(tx, timeZone, onShared, () => values);
      return { calendar: toCalendar(values), bookingsOutsideCalendar };
    });
    this.logger.info(
      { spaceId, bookingsOutsideCalendar: out.bookingsOutsideCalendar },
      'calendar.shared.saved',
    );
    return out;
  }

  async putSeat(
    ownerId: string,
    spaceId: string,
    seatId: string,
    input: CalendarInput,
  ): Promise<CalendarChange> {
    const values = {
      startDate: input.startDate,
      endDate: input.endDate,
      weekdays: weekdayMask(input.weekdays),
    };
    const out = await this.db.transaction(async (tx) => {
      const timeZone = await this.lockSpace(tx, ownerId, spaceId);
      await this.activeSeat(tx, spaceId, seatId);
      await tx
        .insert(availabilityCalendar)
        .values({ spaceId, seatId, ...values })
        .onConflictDoUpdate({
          target: availabilityCalendar.seatId,
          set: { ...values, updatedAt: new Date() },
        });
      const bookingsOutsideCalendar = await this.countOutside(tx, timeZone, [seatId], () => values);
      return { calendar: toCalendar(values), bookingsOutsideCalendar };
    });
    this.logger.info({ spaceId, seatId }, 'calendar.seat.saved');
    return out;
  }

  async removeSeat(ownerId: string, spaceId: string, seatId: string): Promise<CalendarChange> {
    const out = await this.db.transaction(async (tx) => {
      const timeZone = await this.lockSpace(tx, ownerId, spaceId);
      await this.activeSeat(tx, spaceId, seatId);
      await tx.delete(availabilityCalendar).where(eq(availabilityCalendar.seatId, seatId));
      const shared = await this.sharedRow(tx, spaceId);
      const effective = shared ?? CLOSED;
      const bookingsOutsideCalendar = await this.countOutside(
        tx,
        timeZone,
        [seatId],
        () => effective,
      );
      return { calendar: null, bookingsOutsideCalendar };
    });
    this.logger.info({ spaceId, seatId }, 'calendar.seat.removed');
    return out;
  }
}
