import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';

import { ProblemException } from '../common/errors/problem.exception.js';
import { Clock } from '../common/time/clock.js';
import { toLocal } from '../common/time/zoned-time.js';
import type { Env } from '../config/env.js';
import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import { booking, seat, space } from '../db/schema/index.js';
import { MailService } from '../mail/mail.service.js';
import { legacyLocation } from '../spaces/legacy-location.js';
import { resolveWindow } from '../spaces/spaces.service.js';
import { buildBookingConfirmation, confirmationJobId } from './booking-confirmation.mail.js';
import { classifyInsertError } from './booking-conflicts.js';
import { evaluateBookingRules } from './booking-rules.js';
import type { Booking, CreateBookingInput } from './bookings.schemas.js';

/** The signed-in user a request acts for (from the session). */
export interface Caller {
  id: string;
  name: string;
  email: string;
}

/** Cross-seat user-overlap deadlocks are retried (same-seat ones are queued by the seat lock); see ADR-0008 section 2. */
export const MAX_INSERT_ATTEMPTS = 3;

/** Longest an insert may wait on the seat lock or a row lock before it fails (ADR-0009 section 9). */
export const LOCK_TIMEOUT = '5s';

/**
 * Upper bound for queueing the confirmation. The shared ioredis client retries forever while
 * Redis is down, so an unbounded `queue.add` would hang the request (ADR-0008 section 5).
 */
export const CONFIRMATION_ENQUEUE_TIMEOUT_MS = 2_000;

class EnqueueTimeout extends Error {}

interface BookingView {
  booking: Pick<
    typeof booking.$inferSelect,
    'id' | 'status' | 'startsAt' | 'endsAt' | 'createdAt' | 'cancelledAt'
  >;
  seat: { id: string; label: string };
  space: { id: string; name: string; location: string; timeZone: string };
}

/** The API shape: UTC instants plus the space-local date and times (ADR-0008 section 1). */
function toBooking({ booking: b, seat: st, space: sp }: BookingView): Booking {
  const start = toLocal(b.startsAt, sp.timeZone);
  return {
    id: b.id,
    status: b.status,
    date: start.date,
    startTime: start.time,
    endTime: toLocal(b.endsAt, sp.timeZone).time,
    timeZone: sp.timeZone,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    seat: { id: st.id, label: st.label },
    space: { id: sp.id, name: sp.name, location: sp.location },
    createdAt: b.createdAt.toISOString(),
    cancelledAt: b.cancelledAt?.toISOString() ?? null,
  };
}

/**
 * Bookings always belong to the caller: every read and write is scoped to `caller.id` in SQL.
 * Overlaps are not pre-checked; the exclusion constraints decide (no race window).
 */
@Injectable()
export class BookingsService {
  private readonly appUrl: string;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BookingsService.name);
    this.appUrl = config.get('NEXT_PUBLIC_APP_URL', { infer: true });
  }

  async create(caller: Caller, input: CreateBookingInput): Promise<Booking> {
    const [found] = await this.db
      .select({
        seat: { id: seat.id, label: seat.label },
        space: {
          id: space.id,
          name: space.name,
          location: legacyLocation,
          timeZone: space.timeZone,
        },
      })
      .from(seat)
      .innerJoin(space, eq(space.id, seat.spaceId))
      .where(and(eq(seat.id, input.seatId), isNull(seat.removedAt)));
    if (!found) throw new NotFoundException('Seat not found');

    const violation = evaluateBookingRules(input, found.space.timeZone, this.clock.now());
    if (violation) {
      throw new ProblemException(422, violation.type, violation.title, violation.detail);
    }
    const { startsAt, endsAt } = resolveWindow(input, found.space.timeZone);

    const row = await this.insertWithRetry({
      seatId: found.seat.id,
      userId: caller.id,
      startsAt,
      endsAt,
    });
    this.logger.info({ bookingId: row.id, seatId: row.seatId }, 'booking.created');
    const created = toBooking({ booking: row, ...found });
    await this.queueConfirmation(created, caller);
    return created;
  }

  /**
   * Queues the confirmation email after the booking committed. A failure or timeout is logged
   * and swallowed: a lost email must never undo a booking (FR-008). A timed-out add can still
   * land once Redis is back; the job id stops a duplicate. Logs never carry the address or body.
   */
  private async queueConfirmation(created: Booking, caller: Caller): Promise<void> {
    const jobId = confirmationJobId(created.id);
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new EnqueueTimeout());
      }, CONFIRMATION_ENQUEUE_TIMEOUT_MS);
    });
    try {
      const job = buildBookingConfirmation(created, caller, this.appUrl);
      await Promise.race([this.mail.send(job, { jobId }), timeout]);
      this.logger.info({ bookingId: created.id, jobId }, 'booking.confirmation_queued');
    } catch (err) {
      const reason = err instanceof EnqueueTimeout ? 'timeout' : 'rejected';
      this.logger.error({ bookingId: created.id, reason }, 'booking.confirmation_not_queued');
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * One short transaction per attempt, so a retry after a deadlock is safe. It first takes a
   * transaction-scoped advisory lock on the seat: concurrent inserts for the same seat queue
   * here instead of colliding inside the exclusion-constraint check, where Postgres resolves
   * the collision as a deadlock only after `deadlock_timeout` (1 s) and 20+ racers exhaust
   * the retries (HTTP 500). The constraints still decide the outcome; the lock only orders
   * the attempts. Different seats do not contend.
   */
  private async insertWithRetry(values: typeof booking.$inferInsert) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.db.transaction(async (tx) => {
          await tx.execute(sql`set local lock_timeout = ${sql.raw(`'${LOCK_TIMEOUT}'`)}`);
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${values.seatId}::text, 0))`,
          );
          const [row] = await tx.insert(booking).values(values).returning();
          if (!row) throw new Error('booking insert returned no row');
          return row;
        });
      } catch (err) {
        const outcome = classifyInsertError(err);
        if (outcome === 'lock-timeout') {
          // Not retried: the seat is under heavy contention, so waiting again would pile on.
          this.logger.warn(
            { seatId: values.seatId, userId: values.userId },
            'booking.lock_timeout',
          );
          throw err;
        }
        if (outcome === 'retry' && attempt < MAX_INSERT_ATTEMPTS) continue;
        if (outcome === 'retry' || outcome === 'rethrow') throw err;
        throw outcome;
      }
    }
  }
}
