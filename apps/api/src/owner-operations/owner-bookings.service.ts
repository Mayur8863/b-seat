import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';

import { Clock } from '../common/time/clock.js';
import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import { booking, seat, space, user } from '../db/schema/index.js';
import {
  decodeCursor,
  encodeCursor,
  type ListOwnerBookingsInput,
  type OwnerBooking,
  type OwnerBookingList,
} from './owner-bookings.schemas.js';

@Injectable()
export class OwnerBookingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  /**
   * Active pass bookings at the caller's own space that have not ended, optionally with a day
   * (an active hold's `service_date`) in `[from, to]`, keyset-paged by `(starts_at, id)`.
   * Another owner's space is a 404 like an unknown id (FR-028).
   */
  async list(
    ownerId: string,
    spaceId: string,
    { from, to, cursor, limit }: ListOwnerBookingsInput,
  ): Promise<OwnerBookingList> {
    const [owned] = await this.db
      .select({ id: space.id, timeZone: space.timeZone })
      .from(space)
      .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)));
    if (!owned) throw new NotFoundException();

    const key = cursor === undefined ? null : decodeCursor(cursor);
    const hasDayInRange =
      from === undefined && to === undefined
        ? undefined
        : sql`exists (
            select 1 from seat_hold h
            where h.booking_id = ${booking.id} and h.active
              ${from === undefined ? sql`` : sql`and h.service_date >= ${from}::date`}
              ${to === undefined ? sql`` : sql`and h.service_date <= ${to}::date`}
          )`;

    const rows = await this.db
      .select({
        b: booking,
        seatLabel: seat.label,
        renterName: user.name,
        renterEmail: user.email,
      })
      .from(booking)
      .innerJoin(seat, eq(seat.id, booking.seatId))
      .innerJoin(user, eq(user.id, booking.userId))
      .where(
        and(
          eq(booking.spaceId, spaceId),
          eq(booking.kind, 'pass'),
          eq(booking.status, 'active'),
          gt(booking.endsAt, this.clock.now()),
          hasDayInRange,
          key === null
            ? undefined
            : sql`(${booking.startsAt}, ${booking.id}) > (${key.startsAt}::timestamptz, ${key.id}::uuid)`,
        ),
      )
      .orderBy(asc(booking.startsAt), asc(booking.id))
      .limit(limit + 1);

    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const items = page.flatMap(({ b, seatLabel, renterName, renterEmail }): OwnerBooking[] => {
      if (!b.pass || !b.slot || !b.startDate || !b.endDate) return [];
      if (b.price === null || b.currency === null) return [];
      return [
        {
          id: b.id,
          status: b.status,
          renter: { name: renterName, email: renterEmail },
          seat: { id: b.seatId, label: seatLabel },
          pass: b.pass,
          slot: b.slot,
          startDate: b.startDate,
          endDate: b.endDate,
          timeZone: owned.timeZone,
          firstStartsAt: b.startsAt.toISOString(),
          lastEndsAt: b.endsAt.toISOString(),
          price: { amount: b.price, currency: b.currency },
          createdAt: b.createdAt.toISOString(),
        },
      ];
    });
    return {
      items,
      nextCursor:
        rows.length > limit && last
          ? encodeCursor({ startsAt: last.b.startsAt.toISOString(), id: last.b.id })
          : null,
    };
  }
}
