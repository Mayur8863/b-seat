import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { naturalSeatOrder } from '../marketplace/seat-order.js';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';

import {
  cubicleNameTaken,
  labelTaken,
  seatHasFutureBookings,
  seatLimit,
} from '../common/errors/problem-types.js';
import { Clock } from '../common/time/clock.js';
import { seatsToday } from '../owner-operations/occupancy.queries.js';
import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import {
  availabilityCalendar,
  booking,
  cubicle,
  layoutElement,
  seat,
  space,
} from '../db/schema/index.js';
import { lockSeats, type SeatLockTx, withLockTimeout } from '../bookings/seat-lock.js';
import {
  type CreateCubicleInput,
  type CreateSeatsInput,
  type Cubicle,
  type CubicleList,
  MAX_SEATS,
  type OwnerSeat,
  type OwnerSeatList,
  patternLabels,
  type UpdateSeatInput,
} from './owner-seats.schemas.js';

type Tx = SeatLockTx;
type SeatRow = typeof seat.$inferSelect;

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown, constraint: string): boolean {
  for (
    let e: unknown = err;
    typeof e === 'object' && e !== null;
    e = (e as { cause?: unknown }).cause
  ) {
    if (
      'code' in e &&
      e.code === UNIQUE_VIOLATION &&
      'constraint' in e &&
      e.constraint === constraint
    ) {
      return true;
    }
  }
  return false;
}

@Injectable()
export class OwnerSeatsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OwnerSeatsService.name);
  }

  /** Locks the caller's space row (R-15) or throws the shared 404; others' spaces look missing. */
  private async lockSpace(tx: Tx, ownerId: string, spaceId: string): Promise<void> {
    const rows = await withLockTimeout(tx, this.logger, { spaceId }, () =>
      tx
        .select({ id: space.id })
        .from(space)
        .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)))
        .for('update'),
    );
    if (rows.length === 0) throw new NotFoundException();
  }

  private async assertOwned(ownerId: string, spaceId: string): Promise<void> {
    const rows = await this.db
      .select({ id: space.id })
      .from(space)
      .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)));
    if (rows.length === 0) throw new NotFoundException();
  }

  private async toSeats(tx: Tx | Database, rows: SeatRow[]): Promise<OwnerSeat[]> {
    const ids = [...new Set(rows.flatMap((r) => (r.cubicleId ? [r.cubicleId] : [])))];
    const cubs =
      ids.length === 0
        ? []
        : await tx
            .select({ id: cubicle.id, name: cubicle.name })
            .from(cubicle)
            .where(inArray(cubicle.id, ids));
    const names = new Map(cubs.map((c) => [c.id, c.name]));
    const today = await seatsToday(
      this.db,
      rows.map((r) => r.id),
      this.clock.now(),
    );
    const ownCal = new Set(
      rows.length === 0
        ? []
        : (
            await tx
              .select({ seatId: availabilityCalendar.seatId })
              .from(availabilityCalendar)
              .where(
                inArray(
                  availabilityCalendar.seatId,
                  rows.map((r) => r.id),
                ),
              )
          ).map((c) => c.seatId),
    );
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      features: r.features,
      cubicle:
        r.cubicleId && names.has(r.cubicleId)
          ? { id: r.cubicleId, name: names.get(r.cubicleId) ?? '' }
          : null,
      calendar: ownCal.has(r.id) ? 'own' : 'shared',
      today: today.get(r.id) ?? { state: 'vacant', note: null, markId: null },
    }));
  }

  private activeCubicle(tx: Tx, spaceId: string, cubicleId: string) {
    return tx
      .select({ id: cubicle.id })
      .from(cubicle)
      .where(
        and(eq(cubicle.id, cubicleId), eq(cubicle.spaceId, spaceId), isNull(cubicle.removedAt)),
      );
  }

  async listSeats(ownerId: string, spaceId: string): Promise<OwnerSeatList> {
    await this.assertOwned(ownerId, spaceId);
    const rows = await this.db
      .select()
      .from(seat)
      .where(and(eq(seat.spaceId, spaceId), isNull(seat.removedAt)))
      .orderBy(...naturalSeatOrder(), asc(seat.id));
    return { items: await this.toSeats(this.db, rows) };
  }

  async createSeats(
    ownerId: string,
    spaceId: string,
    input: CreateSeatsInput,
  ): Promise<OwnerSeatList> {
    const specs = input.seats
      ? input.seats.map((s) => ({ label: s.label, cubicleId: s.cubicleId, features: s.features }))
      : patternLabels(input.pattern ?? { prefix: '', from: 1, to: 0 }).map((label) => ({
          label,
          cubicleId: input.cubicleId,
          features: input.features,
        }));
    const created = await this.db.transaction(async (tx) => {
      await this.lockSpace(tx, ownerId, spaceId);
      const cubicleIds = [...new Set(specs.flatMap((s) => (s.cubicleId ? [s.cubicleId] : [])))];
      for (const id of cubicleIds) {
        if ((await this.activeCubicle(tx, spaceId, id)).length === 0) throw new NotFoundException();
      }
      const active = await tx
        .select({ label: seat.label })
        .from(seat)
        .where(and(eq(seat.spaceId, spaceId), isNull(seat.removedAt)));
      if (active.length + specs.length > MAX_SEATS) throw seatLimit();
      const existing = new Set(active.map((s) => s.label));
      const seen = new Set<string>();
      const taken = new Set<string>();
      for (const { label } of specs) {
        if (existing.has(label) || seen.has(label)) taken.add(label);
        seen.add(label);
      }
      const [first, ...rest] = [...taken];
      if (first !== undefined) throw labelTaken([first, ...rest]);
      return tx
        .insert(seat)
        .values(
          specs.map((s) => ({
            spaceId,
            label: s.label,
            features: s.features,
            cubicleId: s.cubicleId ?? null,
          })),
        )
        .returning();
    });
    this.logger.info({ spaceId, ownerId, count: created.length }, 'listing.seats-added');
    const sorted = [...created].sort((x, y) =>
      x.label.localeCompare(y.label, 'en', { numeric: true }),
    );
    return { items: await this.toSeats(this.db, sorted) };
  }

  async updateSeat(
    ownerId: string,
    spaceId: string,
    seatId: string,
    input: UpdateSeatInput,
  ): Promise<OwnerSeat> {
    const row = await this.db.transaction(async (tx) => {
      await this.lockSpace(tx, ownerId, spaceId);
      const [current] = await tx
        .select()
        .from(seat)
        .where(and(eq(seat.id, seatId), eq(seat.spaceId, spaceId), isNull(seat.removedAt)))
        .for('update');
      if (!current) throw new NotFoundException();
      if (
        input.cubicleId &&
        (await this.activeCubicle(tx, spaceId, input.cubicleId)).length === 0
      ) {
        throw new NotFoundException();
      }
      if (input.label !== undefined && input.label !== current.label) {
        const clash = await tx
          .select({ id: seat.id })
          .from(seat)
          .where(
            and(eq(seat.spaceId, spaceId), eq(seat.label, input.label), isNull(seat.removedAt)),
          );
        if (clash.length > 0) throw labelTaken([input.label]);
      }
      const [updated] = await tx
        .update(seat)
        .set({
          ...(input.label !== undefined && { label: input.label }),
          ...(input.features !== undefined && { features: input.features }),
          ...(input.cubicleId !== undefined && { cubicleId: input.cubicleId }),
        })
        .where(eq(seat.id, seatId))
        .returning();
      if (!updated) throw new NotFoundException();
      return updated;
    });
    const [out] = await this.toSeats(this.db, [row]);
    if (!out) throw new NotFoundException();
    return out;
  }

  /** True when an active pass booking on one of the seats has not ended yet. */
  private async hasFutureBookings(tx: Tx, seatIds: string[]): Promise<boolean> {
    if (seatIds.length === 0) return false;
    const rows = await tx
      .select({ id: booking.id })
      .from(booking)
      .where(
        and(
          inArray(booking.seatId, seatIds),
          eq(booking.status, 'active'),
          sql`${booking.endsAt} > ${this.clock.now().toISOString()}::timestamptz`,
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /** Booking writers take the per-seat advisory locks, so holding them here excludes a racing booking. */
  private async lockAndCheck(tx: Tx, seatIds: string[]): Promise<void> {
    await withLockTimeout(tx, this.logger, { seatId: seatIds[0] ?? '' }, () =>
      lockSeats(tx, seatIds),
    );
    if (await this.hasFutureBookings(tx, seatIds)) throw seatHasFutureBookings();
  }

  async deleteSeat(ownerId: string, spaceId: string, seatId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockSpace(tx, ownerId, spaceId);
      const [current] = await tx
        .select({ id: seat.id })
        .from(seat)
        .where(and(eq(seat.id, seatId), eq(seat.spaceId, spaceId), isNull(seat.removedAt)));
      if (!current) throw new NotFoundException();
      await this.lockAndCheck(tx, [seatId]);
      await tx
        .update(seat)
        .set({ removedAt: sql`now()` })
        .where(eq(seat.id, seatId));
      await tx.delete(layoutElement).where(eq(layoutElement.seatId, seatId));
    });
    this.logger.info({ spaceId, ownerId, seatId }, 'listing.seat-removed');
  }

  private async loadCubicle(tx: Tx | Database, spaceId: string, id: string): Promise<Cubicle> {
    const [row] = await tx
      .select({
        id: cubicle.id,
        name: cubicle.name,
        seatCount: sql<number>`(select count(*)::int from "seat" where "seat"."cubicle_id" = "cubicle"."id" and "seat"."removed_at" is null)`,
      })
      .from(cubicle)
      .where(and(eq(cubicle.id, id), eq(cubicle.spaceId, spaceId), isNull(cubicle.removedAt)));
    if (!row) throw new NotFoundException();
    return row;
  }

  async listCubicles(ownerId: string, spaceId: string): Promise<CubicleList> {
    await this.assertOwned(ownerId, spaceId);
    const items = await this.db
      .select({
        id: cubicle.id,
        name: cubicle.name,
        seatCount: sql<number>`(select count(*)::int from "seat" where "seat"."cubicle_id" = "cubicle"."id" and "seat"."removed_at" is null)`,
      })
      .from(cubicle)
      .where(and(eq(cubicle.spaceId, spaceId), isNull(cubicle.removedAt)))
      .orderBy(asc(sql`lower(${cubicle.name})`), asc(cubicle.name), asc(cubicle.id));
    return { items };
  }

  async createCubicle(
    ownerId: string,
    spaceId: string,
    input: CreateCubicleInput,
  ): Promise<Cubicle> {
    const id = await this.db.transaction(async (tx) => {
      await this.lockSpace(tx, ownerId, spaceId);
      try {
        const [row] = await tx
          .insert(cubicle)
          .values({ spaceId, name: input.name })
          .returning({ id: cubicle.id });
        if (!row) throw new Error('cubicle insert returned no row');
        return row.id;
      } catch (err) {
        if (isUniqueViolation(err, 'cubicle_space_id_name_active_unique')) throw cubicleNameTaken();
        throw err;
      }
    });
    return this.loadCubicle(this.db, spaceId, id);
  }

  async renameCubicle(
    ownerId: string,
    spaceId: string,
    cubicleId: string,
    input: CreateCubicleInput,
  ): Promise<Cubicle> {
    await this.db.transaction(async (tx) => {
      await this.lockSpace(tx, ownerId, spaceId);
      if ((await this.activeCubicle(tx, spaceId, cubicleId)).length === 0)
        throw new NotFoundException();
      try {
        await tx.update(cubicle).set({ name: input.name }).where(eq(cubicle.id, cubicleId));
      } catch (err) {
        if (isUniqueViolation(err, 'cubicle_space_id_name_active_unique')) throw cubicleNameTaken();
        throw err;
      }
    });
    return this.loadCubicle(this.db, spaceId, cubicleId);
  }

  async deleteCubicle(ownerId: string, spaceId: string, cubicleId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockSpace(tx, ownerId, spaceId);
      if ((await this.activeCubicle(tx, spaceId, cubicleId)).length === 0)
        throw new NotFoundException();
      const seats = await tx
        .select({ id: seat.id })
        .from(seat)
        .where(and(eq(seat.cubicleId, cubicleId), isNull(seat.removedAt)));
      const seatIds = seats.map((s) => s.id);
      await this.lockAndCheck(tx, seatIds);
      if (seatIds.length > 0) {
        await tx
          .update(seat)
          .set({ removedAt: sql`now()` })
          .where(inArray(seat.id, seatIds));
        await tx.delete(layoutElement).where(inArray(layoutElement.seatId, seatIds));
      }
      await tx.delete(layoutElement).where(eq(layoutElement.cubicleId, cubicleId));
      await tx
        .update(cubicle)
        .set({ removedAt: sql`now()` })
        .where(eq(cubicle.id, cubicleId));
    });
    this.logger.info({ spaceId, ownerId, cubicleId }, 'listing.cubicle-removed');
  }
}
