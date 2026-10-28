import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import { ProblemException } from '../common/errors/problem.exception.js';
import { fullDaySaving } from '../common/money/money.js';
import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import {
  availabilityCalendar,
  cubicle,
  passPrice,
  seat,
  space,
  spaceSlot,
} from '../db/schema/index.js';
import { evaluatePassBookingRules } from '../marketplace/booking-rules.js';
import type { Calendar } from '../marketplace/calendar-rules.js';
import { passPeriod, type PassOccurrence } from '../marketplace/pass-period.js';
import { offeredSlots } from '../marketplace/slots.js';
import { openingHoursOf, slotTimes } from '../owner-spaces/owner-spaces.service.js';
import type {
  Listing,
  ListingSeatAvailability,
  SeatAvailabilityInput,
} from './listings.schemas.js';

// Fail closed: a space without a shared calendar offers no open day (T004 review).
const CLOSED: Calendar = { startDate: '0001-01-01', endDate: null, weekdays: 0 };

interface Hold {
  seatId: string;
  startsAt: Date;
  endsAt: Date | null;
}

const PASSES = ['day', 'week', 'month'] as const;

@Injectable()
export class ListingsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(userId: string, spaceId: string): Promise<Listing> {
    const [s] = await this.db
      .select()
      .from(space)
      .where(and(eq(space.id, spaceId), eq(space.status, 'published')));
    if (!s?.openingMode) throw new NotFoundException('Space not found');

    const [slots, prices] = await Promise.all([
      this.db.select().from(spaceSlot).where(eq(spaceSlot.spaceId, spaceId)),
      this.db.select().from(passPrice).where(eq(passPrice.spaceId, spaceId)),
    ]);
    const openingHours = openingHoursOf(s);
    const priceOf = (slot: string, pass: string) =>
      prices.find((p) => p.slot === slot && p.pass === pass)?.amount ?? null;

    const offers = offeredSlots(openingHours)
      .filter((kind) => slots.find((r) => r.slot === kind)?.enabled ?? true)
      .map((kind) => ({
        slot: kind,
        ...slotTimes(openingHours, kind),
        prices: {
          day: priceOf(kind, 'day'),
          week: priceOf(kind, 'week'),
          month: priceOf(kind, 'month'),
        },
      }))
      .filter((o) => PASSES.some((p) => o.prices[p] !== null));

    const price = (slot: string, pass: (typeof PASSES)[number]) =>
      offers.find((o) => o.slot === slot)?.prices[pass] ?? null;
    const saving = (pass: (typeof PASSES)[number]) => {
      const [day, night, fullDay] = [
        price('day', pass),
        price('night', pass),
        price('full_day', pass),
      ];
      return day && night && fullDay ? fullDaySaving(day, night, fullDay) : null;
    };
    const savings = { day: saving('day'), week: saving('week'), month: saving('month') };

    return {
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      country: s.country ?? '',
      city: s.city ?? '',
      area: s.area ?? '',
      streetAddress: s.streetAddress ?? '',
      timeZone: s.timeZone,
      currency: s.currency ?? '',
      utilities: s.utilities as Listing['utilities'],
      customUtilities: s.customUtilities,
      // The layout tables arrive with the layout feature (US8).
      hasLayout: false,
      openingHours,
      offers,
      fullDaySavings: savings.day || savings.week || savings.month ? savings : null,
      isOwnSpace: s.ownerId === userId,
    };
  }

  async seatAvailability(
    spaceId: string,
    input: SeatAvailabilityInput,
  ): Promise<ListingSeatAvailability> {
    const [s] = await this.db
      .select()
      .from(space)
      .where(and(eq(space.id, spaceId), eq(space.status, 'published')));
    if (!s?.openingMode) throw new NotFoundException('Space not found');

    const openingHours = openingHoursOf(s);
    const [slots, [price], seats, calendars] = await Promise.all([
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
        .select({
          id: seat.id,
          label: seat.label,
          features: seat.features,
          cubicleId: cubicle.id,
          cubicleName: cubicle.name,
        })
        .from(seat)
        .leftJoin(cubicle, and(eq(cubicle.id, seat.cubicleId), isNull(cubicle.removedAt)))
        .where(and(eq(seat.spaceId, spaceId), isNull(seat.removedAt)))
        .orderBy(asc(seat.label)),
      this.db.select().from(availabilityCalendar).where(eq(availabilityCalendar.spaceId, spaceId)),
    ]);

    const offered = offeredSlots(openingHours).includes(input.slot) && (slots[0]?.enabled ?? true);
    if (!offered || !price) throw passNotOffered();

    const shared = calendars.find((c) => c.seatId === null) ?? null;
    const own = new Map(calendars.filter((c) => c.seatId !== null).map((c) => [c.seatId, c]));

    // One period per distinct calendar (usually one).
    const periods = new Map<string, ReturnType<typeof passPeriod>>();
    const periodFor = (seatId: string) => {
      const row = own.get(seatId);
      const calendar: Calendar = row ?? shared ?? CLOSED;
      const key = `${calendar.startDate}|${calendar.endDate ?? ''}|${calendar.weekdays}`;
      let period = periods.get(key);
      if (!period) {
        period = passPeriod({
          pass: input.pass,
          slot: input.slot,
          startDate: input.startDate,
          calendar,
          openingHours,
          timeZone: s.timeZone,
        });
        periods.set(key, period);
      }
      return period;
    };
    const perSeat = seats.map((x) => ({ seat: x, period: periodFor(x.id) }));

    const all: PassOccurrence[] = [...periods.values()].flatMap((p) => p.occurrences);
    const holds = all.length > 0 ? await this.holdsOver(spaceId, all) : [];
    const holdsBySeat = new Map<string, Hold[]>();
    for (const h of holds) holdsBySeat.set(h.seatId, [...(holdsBySeat.get(h.seatId) ?? []), h]);

    const times = slotTimes(openingHours, input.slot);
    return {
      space: { id: s.id, name: s.name, timeZone: s.timeZone },
      pass: input.pass,
      slot: input.slot,
      startDate: input.startDate,
      endDate: passPeriod({
        pass: input.pass,
        slot: input.slot,
        startDate: input.startDate,
        calendar: CLOSED,
        openingHours,
        timeZone: s.timeZone,
      }).endDate,
      slotTimes: times,
      price: price.amount,
      seats: perSeat.map(({ seat: x, period }) => {
        const first = period.occurrences[0];
        const last = period.occurrences[period.occurrences.length - 1];
        const closed = !period.startDayOpen || !first || !last;
        const mine = holdsBySeat.get(x.id) ?? [];
        const taken =
          !closed &&
          period.occurrences.some((o) =>
            mine.some((h) => h.startsAt < o.endsAt && (h.endsAt === null || h.endsAt > o.startsAt)),
          );
        return {
          id: x.id,
          label: x.label,
          features: x.features,
          cubicle: x.cubicleId && x.cubicleName ? { id: x.cubicleId, name: x.cubicleName } : null,
          status: closed ? 'closed' : taken ? 'taken' : 'free',
          firstStartsAt: closed ? null : first.startsAt.toISOString(),
          lastEndsAt: closed ? null : last.endsAt.toISOString(),
          includedDates: period.occurrences.length,
          closedDates: period.skippedDates,
        };
      }),
    };
  }

  /** One query for every active hold of the space inside the envelope, spelled for the GiST index (R-10). */
  private async holdsOver(spaceId: string, occurrences: PassOccurrence[]): Promise<Hold[]> {
    const from = new Date(Math.min(...occurrences.map((o) => o.startsAt.getTime())));
    const to = new Date(Math.max(...occurrences.map((o) => o.endsAt.getTime())));
    const result = await this.db.execute<{
      seat_id: string;
      starts_at: Date;
      ends_at: Date | null;
    }>(sql`
      SELECT h.seat_id, h.starts_at, h.ends_at
      FROM seat s
      JOIN seat_hold h ON h.seat_id = s.id
      WHERE s.space_id = ${spaceId}
        AND s.removed_at IS NULL
        AND h.active
        AND tstzrange(h.starts_at, h.ends_at, '[)')
            && tstzrange(${from.toISOString()}::timestamptz, ${to.toISOString()}::timestamptz, '[)')
    `);
    return result.rows.map((r) => ({
      seatId: r.seat_id,
      startsAt: new Date(r.starts_at),
      endsAt: r.ends_at === null ? null : new Date(r.ends_at),
    }));
  }
}

function passNotOffered(): ProblemException {
  const v = evaluatePassBookingRules(
    {
      space: { status: 'published' },
      isOwner: false,
      offered: false,
      startDayOpen: true,
      firstStartsAt: new Date(),
    },
    new Date(),
  );
  if (!v) throw new Error('pass-not-offered rule did not fire');
  return new ProblemException(v.status, v.type, v.title, v.detail);
}
