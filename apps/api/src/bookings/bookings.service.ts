import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
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
import { classifyInsertError } from './booking-conflicts.js';
import type { Booking, CreateBookingInput } from './bookings.schemas.js';
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
    const facts = await this.loadFacts(spaceId, input);
    const plan = planPassBooking(facts, userId, input, this.clock.now());

    const header = await withSeatLocks(
      this.db,
      [input.seatId],
      (tx) => this.insert(tx, userId, spaceId, input, plan),
      {
        classify: classifyInsertError,
        // Seat removal (T021) locks the space row and then the seat locks; taking the space
        // first here keeps one order, so the two never deadlock. It also makes an unpublish
        // that is waiting on the space row queue behind this booking.
        beforeLocks: async (tx) => {
          await tx.execute(sql`SELECT 1 FROM space WHERE id = ${spaceId} FOR SHARE`);
        },
        onRetry: (attempt) => {
          this.logger.warn({ seatId: input.seatId, attempt }, 'booking.insert_deadlock_retry');
        },
        onLockTimeout: () => {
          this.logger.warn({ seatId: input.seatId, spaceId }, 'booking.lock_timeout');
        },
      },
    );

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

  /** Step 1: space (any status; a draft is refused by the plan), the active seat of that space, price, slot flag, calendar. */
  async loadFacts(spaceId: string, input: CreateBookingInput): Promise<PassBookingFacts> {
    const [s] = await this.db.select().from(space).where(eq(space.id, spaceId));
    if (!s?.openingMode) throw new NotFoundException();
    const [row] = await this.db
      .select({ id: seat.id, label: seat.label, cubicleName: cubicle.name })
      .from(seat)
      .leftJoin(cubicle, and(eq(cubicle.id, seat.cubicleId), isNull(cubicle.removedAt)))
      .where(and(eq(seat.id, input.seatId), eq(seat.spaceId, spaceId), isNull(seat.removedAt)));
    if (!row) throw new NotFoundException();

    const [[slot], [price], calendars] = await Promise.all([
      this.db
        .select()
        .from(spaceSlot)
        .where(and(eq(spaceSlot.spaceId, spaceId), eq(spaceSlot.slot, input.slot))),
      this.db
        .select()
        .from(passPrice)
        .where(
          and(
            eq(passPrice.spaceId, spaceId),
            eq(passPrice.slot, input.slot),
            eq(passPrice.pass, input.pass),
          ),
        ),
      this.db
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
