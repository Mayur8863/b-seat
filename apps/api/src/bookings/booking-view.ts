import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';

import type { Database } from '../db/db.js';
import { booking, cubicle, seat, seatHold, space } from '../db/schema/index.js';
import { addDays, toLocal } from '../common/time/zoned-time.js';
import { openingHoursOf, slotTimes } from '../owner-spaces/owner-spaces.service.js';
import type { Booking } from './bookings.schemas.js';

/** Reads that need only a `Database` (or a transaction), so cancel can re-read inside its lock. */
type Reader = Pick<Database, 'select'>;

/** Most dates a pass spans (month = 30 days), the bound for the skipped-date walk. */
const MAX_SPAN_DAYS = 31;

/**
 * Loads pass bookings matching `where` as renter-facing `Booking`s (hold dates become `days`,
 * the other dates in the period become `skippedDates`). Rows come back ordered by
 * `starts_at, id`. The caller's `where` is what scopes the read; this never widens it.
 */
export async function loadBookings(
  db: Reader,
  where: SQL | undefined,
  limit?: number,
): Promise<Booking[]> {
  const query = db
    .select({
      b: booking,
      seatLabel: seat.label,
      cubicleName: cubicle.name,
      s: space,
    })
    .from(booking)
    .innerJoin(seat, eq(seat.id, booking.seatId))
    .innerJoin(space, eq(space.id, booking.spaceId))
    .leftJoin(cubicle, and(eq(cubicle.id, seat.cubicleId), isNull(cubicle.removedAt)))
    .where(and(eq(booking.kind, 'pass'), where))
    .orderBy(asc(booking.startsAt), asc(booking.id));
  const rows = await (limit === undefined ? query : query.limit(limit));
  if (rows.length === 0) return [];

  const holds = await db
    .select({
      bookingId: seatHold.bookingId,
      serviceDate: seatHold.serviceDate,
      startsAt: seatHold.startsAt,
      endsAt: seatHold.endsAt,
    })
    .from(seatHold)
    .where(
      inArray(
        seatHold.bookingId,
        rows.map((r) => r.b.id),
      ),
    )
    .orderBy(asc(seatHold.startsAt));

  return rows.flatMap(({ b, seatLabel, cubicleName, s }) => {
    if (!b.spaceId || !b.pass || !b.slot || !b.startDate || !b.endDate) return [];
    if (b.price === null || b.currency === null) return [];
    const days = holds
      .filter((h) => h.bookingId === b.id && h.serviceDate !== null && h.endsAt !== null)
      .map((h) => ({
        date: h.serviceDate ?? '',
        startsAt: h.startsAt.toISOString(),
        endsAt: (h.endsAt ?? h.startsAt).toISOString(),
      }));
    const first = holds.find((h) => h.bookingId === b.id && h.endsAt !== null);
    const held = new Set(days.map((d) => d.date));
    const skippedDates: string[] = [];
    for (let i = 0; i < MAX_SPAN_DAYS; i += 1) {
      const date = addDays(b.startDate, i);
      if (date > b.endDate) break;
      if (!held.has(date)) skippedDates.push(date);
    }
    return [
      {
        id: b.id,
        status: b.status,
        pass: b.pass,
        slot: b.slot,
        startDate: b.startDate,
        endDate: b.endDate,
        timeZone: s.timeZone,
        slotTimes: bookedSlotTimes(first, s, b.slot),
        firstStartsAt: b.startsAt.toISOString(),
        lastEndsAt: b.endsAt.toISOString(),
        days,
        skippedDates,
        seat: { id: b.seatId, label: seatLabel, cubicleName: cubicleName ?? null },
        space: {
          id: s.id,
          name: s.name,
          area: s.area ?? '',
          city: s.city ?? '',
          country: s.country ?? '',
        },
        price: { amount: b.price, currency: b.currency },
        createdAt: b.createdAt.toISOString(),
        cancelledAt: b.cancelledAt?.toISOString() ?? null,
      },
    ];
  });
}

/**
 * The times the renter booked, read from the booking's first hold: the owner may change the
 * opening hours later, and the booking must not move with them. A booking without a hold falls
 * back to the space's current hours.
 */
function bookedSlotTimes(
  first: { startsAt: Date; endsAt: Date | null } | undefined,
  s: typeof space.$inferSelect,
  slot: Parameters<typeof slotTimes>[1],
) {
  if (!first?.endsAt) return slotTimes(openingHoursOf(s), slot);
  const start = toLocal(first.startsAt, s.timeZone);
  const end = toLocal(first.endsAt, s.timeZone);
  return { startTime: start.time, endTime: end.time, endsNextDay: end.date > start.date };
}
