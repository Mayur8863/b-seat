import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, eq, exists, isNull, sql } from 'drizzle-orm';

import { ruleViolation } from '../bookings/booking-rules.js';
import { ProblemException } from '../common/errors/problem.exception.js';
import { toInstant } from '../common/time/zoned-time.js';
import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import { booking, seat, space } from '../db/schema/index.js';
import { legacyLocation } from './legacy-location.js';
import type { AvailabilityQueryInput, SpaceAvailability, SpaceList } from './spaces.schemas.js';

/** A local window as UTC instants, `[startsAt, endsAt)`. */
export interface ResolvedWindow {
  startsAt: Date;
  endsAt: Date;
}

/**
 * Converts a space-local window to instants. Only a start or end that does not exist or is
 * ambiguous (DST) is refused, with 422 `invalid-local-time`; any other window, even one that
 * breaks booking rules, can be viewed (spec edge case).
 */
export function resolveWindow(query: AvailabilityQueryInput, timeZone: string): ResolvedWindow {
  const start = toInstant(query.date, query.startTime, timeZone);
  const end = toInstant(query.date, query.endTime, timeZone);
  if (start.kind !== 'ok' || end.kind !== 'ok') {
    const { type, title, detail } = ruleViolation('invalid-local-time', timeZone);
    throw new ProblemException(422, type, title, detail);
  }
  return { startsAt: start.instant, endsAt: end.instant };
}

/**
 * Spaces are shared reference data: any signed-in user may read them, so these queries are
 * not scoped to the caller. Availability never exposes who holds a booking (FR-011).
 */
@Injectable()
export class SpacesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(): Promise<SpaceList> {
    const items = await this.db
      .select({
        id: space.id,
        name: space.name,
        location: legacyLocation,
        timeZone: space.timeZone,
        seatCount: count(seat.id),
      })
      .from(space)
      .leftJoin(seat, and(eq(seat.spaceId, space.id), isNull(seat.removedAt)))
      .groupBy(space.id)
      .orderBy(asc(space.name), asc(space.id));
    return { items };
  }

  async availability(spaceId: string, query: AvailabilityQueryInput): Promise<SpaceAvailability> {
    const [found] = await this.db
      .select({
        id: space.id,
        name: space.name,
        location: legacyLocation,
        timeZone: space.timeZone,
      })
      .from(space)
      .where(eq(space.id, spaceId));
    if (!found) throw new NotFoundException('Space not found');

    const { startsAt, endsAt } = resolveWindow(query, found.timeZone);

    // The predicate repeats booking_seat_no_overlap's expression, with 'active' and '[)' as SQL
    // literals (not bound parameters), so the planner can use its partial GiST index (research R-9).
    // Built with the query builder so every column is table-qualified inside the subquery.
    const overlapping = this.db
      .select({ one: sql`1` })
      .from(booking)
      .where(
        and(
          eq(booking.seatId, seat.id),
          sql`${booking.status} = 'active'`,
          sql`tstzrange(${booking.startsAt}, ${booking.endsAt}, '[)') && tstzrange(${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz, '[)')`,
        ),
      );
    const seats = await this.db
      .select({
        id: seat.id,
        label: seat.label,
        features: seat.features,
        taken: sql<boolean>`${exists(overlapping)}`,
      })
      .from(seat)
      .where(and(eq(seat.spaceId, found.id), isNull(seat.removedAt)))
      .orderBy(asc(seat.label));

    return {
      space: found,
      window: {
        date: query.date,
        startTime: query.startTime,
        endTime: query.endTime,
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      },
      seats: seats.map(({ taken: isTaken, ...s }) => ({
        ...s,
        status: isTaken ? 'taken' : 'free',
      })),
    };
  }
}
