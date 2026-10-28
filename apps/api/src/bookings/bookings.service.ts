import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';

import { Clock } from '../common/time/clock.js';
import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import {
  availabilityCalendar,
  booking,
  cubicle,
  passPrice,
  seat,
  seatHold,
  space,
  spaceSlot,
} from '../db/schema/index.js';
import { openingHoursOf } from '../owner-spaces/owner-spaces.service.js';
import { BookingCreatedHook, type BookingCreatedEvent } from './booking-created.hook.js';
import { bookingProblem, classifyInsertError } from './booking-conflicts.js';
import { loadBookings } from './booking-view.js';
import type {
  Booking,
  BookingList,
  CreateBookingInput,
  ListMyBookingsInput,
} from './bookings.schemas.js';
import {
  type PassBookingFacts,
  type PassBookingPlan,
  planPassBooking,
  spaceNotPublished,
} from './pass-booking-plan.js';
import { type SeatLockTx, withSeatLocks } from './seat-lock.js';

/** The hook may not hold the 201 for longer than this (booking-emails.md). */
const HOOK_TIMEOUT_MS = 2000;

@Injectable()
export class BookingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
    private readonly logger: PinoLogger,
    private readonly created: BookingCreatedHook,
  ) {
    this.logger.setContext(BookingsService.name);
  }

  async create(userId: string, spaceId: string, input: CreateBookingInput): Promise<Booking> {
    // Price, slot flag and calendar are read right after the space row is share-locked (and
    // before the seat locks, so the queued bookers do not hold them longer): pricing and calendar
    // writers take the space row FOR UPDATE, so their commit is either seen here or queued behind us.
    let ready: { facts: PassBookingFacts; plan: PassBookingPlan } | undefined;
    const header = await withSeatLocks(
      this.db,
      [input.seatId],
      async (tx) => {
        if (!ready) throw new Error('booking facts were not loaded before the seat lock');
        return this.insert(tx, userId, spaceId, input, ready.plan);
      },
      {
        classify: classifyInsertError,
        // Seat removal (T021) locks the space row and then the seat locks; taking the space
        // first here keeps one order, so the two never deadlock. It also makes an unpublish
        // that is waiting on the space row queue behind this booking.
        beforeLocks: async (tx) => {
          await tx.execute(sql`SELECT 1 FROM space WHERE id = ${spaceId} FOR SHARE`);
          const facts = await this.loadFacts(tx, spaceId, input);
          ready = { facts, plan: planPassBooking(facts, userId, input, this.clock.now()) };
        },
        onRetry: (attempt) => {
          this.logger.warn({ seatId: input.seatId, attempt }, 'booking.insert_deadlock_retry');
        },
        onLockTimeout: () => {
          this.logger.warn({ seatId: input.seatId, spaceId }, 'booking.lock_timeout');
        },
      },
    );
    if (!ready) throw new Error('booking facts were not loaded');
    const { facts, plan } = ready;

    this.logger.info({ bookingId: header.id, seatId: input.seatId, spaceId }, 'booking.created');
    const created = toBooking(header, facts, plan, input);
    await this.notify({
      bookingId: header.id,
      seatId: input.seatId,
      spaceId,
      userId,
      booking: created,
    });
    return created;
  }

  /** The caller's active pass bookings that have not ended, soonest first (FR-026). */
  async listMine(userId: string, { limit }: ListMyBookingsInput): Promise<BookingList> {
    const items = await loadBookings(
      this.db,
      and(
        eq(booking.userId, userId),
        eq(booking.status, 'active'),
        gt(booking.endsAt, this.clock.now()),
      ),
      limit,
    );
    return { items };
  }

  /**
   * One scoped UPDATE; `seat_hold_booking_fk` cascades the holds inactive in the same statement,
   * so this never touches `seat_hold`. Lock order matches create and seat removal: space row,
   * then the seat lock. A booking that is not the caller's is a 404 like an unknown id (FR-028).
   */
  async cancel(userId: string, bookingId: string): Promise<Booking> {
    const [own] = await this.db
      .select({ seatId: booking.seatId, spaceId: booking.spaceId })
      .from(booking)
      .where(and(eq(booking.id, bookingId), eq(booking.userId, userId), eq(booking.kind, 'pass')));
    if (!own?.spaceId) throw new NotFoundException();
    const { seatId, spaceId } = own;

    const cancelled = await withSeatLocks(
      this.db,
      [seatId],
      async (tx) => {
        const now = this.clock.now();
        const updated = await tx
          .update(booking)
          .set({ status: 'cancelled', cancelledAt: now })
          .where(
            and(
              eq(booking.id, bookingId),
              eq(booking.userId, userId),
              eq(booking.kind, 'pass'),
              eq(booking.status, 'active'),
              gt(booking.startsAt, now),
            ),
          )
          .returning({ id: booking.id });
        if (updated.length > 0) return true;
        const [current] = await tx
          .select({ status: booking.status })
          .from(booking)
          .where(and(eq(booking.id, bookingId), eq(booking.userId, userId)));
        if (!current) throw new NotFoundException();
        if (current.status === 'cancelled') return false;
        throw bookingProblem('already-started');
      },
      {
        classify: classifyInsertError,
        beforeLocks: async (tx) => {
          await tx.execute(sql`SELECT 1 FROM space WHERE id = ${spaceId} FOR SHARE`);
        },
        onRetry: (attempt) => {
          this.logger.warn({ seatId, attempt }, 'booking.cancel_deadlock_retry');
        },
        onLockTimeout: () => {
          this.logger.warn({ seatId, spaceId }, 'booking.lock_timeout');
        },
      },
    );
    if (cancelled) this.logger.info({ bookingId }, 'booking.cancelled');

    const [view] = await loadBookings(
      this.db,
      and(eq(booking.id, bookingId), eq(booking.userId, userId)),
    );
    if (!view) throw new NotFoundException();
    return view;
  }

  /** Runs inside the space share lock: space (any status; a draft is refused by the plan), the active seat of that space, price, slot flag, calendar. */
  async loadFacts(
    db: Pick<Database, 'select'>,
    spaceId: string,
    input: CreateBookingInput,
  ): Promise<PassBookingFacts> {
    const [s] = await db.select().from(space).where(eq(space.id, spaceId));
    if (!s?.openingMode) throw new NotFoundException();
    const [row] = await db
      .select({ id: seat.id, label: seat.label, cubicleName: cubicle.name })
      .from(seat)
      .leftJoin(cubicle, and(eq(cubicle.id, seat.cubicleId), isNull(cubicle.removedAt)))
      .where(and(eq(seat.id, input.seatId), eq(seat.spaceId, spaceId), isNull(seat.removedAt)));
    if (!row) throw new NotFoundException();

    const [[slot], [price], calendars] = await Promise.all([
      db
        .select()
        .from(spaceSlot)
        .where(and(eq(spaceSlot.spaceId, spaceId), eq(spaceSlot.slot, input.slot))),
      db
        .select()
        .from(passPrice)
        .where(
          and(
            eq(passPrice.spaceId, spaceId),
            eq(passPrice.slot, input.slot),
            eq(passPrice.pass, input.pass),
          ),
        ),
      db
        .select()
        .from(availabilityCalendar)
        .where(eq(availabilityCalendar.spaceId, spaceId))
        .orderBy(asc(availabilityCalendar.seatId)),
    ]);
    const own = calendars.find((c) => c.seatId === input.seatId);
    const shared = calendars.find((c) => c.seatId === null);
    return {
      space: {
        id: s.id,
        name: s.name,
        area: s.area ?? '',
        city: s.city ?? '',
        country: s.country ?? '',
        currency: s.currency ?? '',
        status: s.status,
        ownerId: s.ownerId,
        timeZone: s.timeZone,
        openingHours: openingHoursOf(s),
      },
      seat: { id: row.id, label: row.label, cubicleName: row.cubicleName },
      slotEnabled: slot?.enabled ?? true,
      price: price?.amount ?? null,
      calendar: own ?? shared ?? null,
    };
  }

  /**
   * Step 4, inside the seat lock: the seat and its space are re-read and share-locked, so an
   * unpublish or removal that commits after the pre-check is refused instead of raced. It runs
   * statements on `tx` only, so a deadlock retry can run it again.
   */
  private async insert(
    tx: SeatLockTx,
    userId: string,
    spaceId: string,
    input: CreateBookingInput,
    plan: PassBookingPlan,
  ): Promise<{ id: string; createdAt: Date }> {
    const current = await tx.execute<{ status: 'draft' | 'published' | 'unpublished' }>(sql`
      SELECT sp.status
      FROM seat st
      JOIN space sp ON sp.id = st.space_id
      WHERE st.id = ${input.seatId} AND st.space_id = ${spaceId} AND st.removed_at IS NULL
      FOR SHARE OF st, sp`);
    const status = current.rows[0]?.status;
    if (!status || status === 'draft') throw new NotFoundException();
    if (status !== 'published') throw spaceNotPublished();

    const [header] = await tx
      .insert(booking)
      .values({
        seatId: input.seatId,
        userId,
        spaceId,
        kind: 'pass',
        pass: input.pass,
        slot: input.slot,
        startDate: input.startDate,
        endDate: plan.period.endDate,
        price: plan.price.amount,
        currency: plan.price.currency,
        startsAt: plan.firstStartsAt,
        endsAt: plan.lastEndsAt,
      })
      .returning({ id: booking.id, createdAt: booking.createdAt });
    if (!header) throw new Error('booking insert returned no row');

    // Chronological, so concurrent writers of one seat meet in the same order.
    await tx.insert(seatHold).values(
      plan.period.occurrences.map((o) => ({
        seatId: input.seatId,
        userId,
        bookingId: header.id,
        serviceDate: o.date,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
      })),
    );
    return header;
  }

  /** After commit: bounded, and a failure is logged (ids only) and swallowed. */
  private async notify(event: BookingCreatedEvent) {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('timeout'));
      }, HOOK_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.created.onCreated(event), timeout]);
    } catch {
      this.logger.warn(
        { bookingId: event.bookingId, seatId: event.seatId, spaceId: event.spaceId },
        'booking.notify_failed',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function toBooking(
  header: { id: string; createdAt: Date },
  facts: PassBookingFacts,
  plan: PassBookingPlan,
  input: CreateBookingInput,
): Booking {
  return {
    id: header.id,
    status: 'active',
    pass: input.pass,
    slot: input.slot,
    startDate: input.startDate,
    endDate: plan.period.endDate,
    timeZone: facts.space.timeZone,
    slotTimes: plan.slotTimes,
    firstStartsAt: plan.firstStartsAt.toISOString(),
    lastEndsAt: plan.lastEndsAt.toISOString(),
    days: plan.period.occurrences.map((o) => ({
      date: o.date,
      startsAt: o.startsAt.toISOString(),
      endsAt: o.endsAt.toISOString(),
    })),
    skippedDates: plan.period.skippedDates,
    seat: { id: facts.seat.id, label: facts.seat.label, cubicleName: facts.seat.cubicleName },
    space: {
      id: facts.space.id,
      name: facts.space.name,
      area: facts.space.area,
      city: facts.space.city,
      country: facts.space.country,
    },
    price: plan.price,
    createdAt: header.createdAt.toISOString(),
    cancelledAt: null,
  };
}
