import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';

import { ProblemException } from '../common/errors/problem.exception.js';
import { PROBLEM_TYPES } from '../common/errors/problem-types.js';
import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import { cubicle, layoutElement, seat, space, spaceLayout } from '../db/schema/index.js';
import {
  DEFAULT_COLUMNS,
  DEFAULT_ROWS,
  type LayoutElement,
  type ListingLayout,
  type OwnerLayout,
  type SaveLayoutInput,
} from './layout.schemas.js';

type Reader = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

const outOfBounds = () =>
  new ProblemException(
    422,
    PROBLEM_TYPES.layoutOutOfBounds,
    'Outside the grid',
    'Keep every item inside the grid, and every seat inside its cubicle.',
  );

const staleVersion = () =>
  new ProblemException(
    409,
    PROBLEM_TYPES.layoutStaleVersion,
    'Layout out of date',
    'This layout changed after you opened it. Reload it and try again.',
  );

/** Cubicles and areas first so seats draw on top of them in DOM order. */
const drawOrder = <T extends { kind: string; x: number; y: number }>(items: T[]): T[] =>
  [...items].sort(
    (a, b) => Number(a.kind === 'seat') - Number(b.kind === 'seat') || a.y - b.y || a.x - b.x,
  );

@Injectable()
export class LayoutService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LayoutService.name);
  }

  private async elementsOf(tx: Reader, spaceId: string): Promise<LayoutElement[]> {
    const rows = await tx
      .select({
        id: layoutElement.id,
        kind: layoutElement.kind,
        seatId: layoutElement.seatId,
        cubicleId: layoutElement.cubicleId,
        area: layoutElement.label,
        seatLabel: seat.label,
        cubicleName: cubicle.name,
        x: layoutElement.x,
        y: layoutElement.y,
        w: layoutElement.w,
        h: layoutElement.h,
      })
      .from(layoutElement)
      .leftJoin(seat, eq(seat.id, layoutElement.seatId))
      .leftJoin(cubicle, eq(cubicle.id, layoutElement.cubicleId))
      .where(eq(layoutElement.spaceId, spaceId))
      .orderBy(asc(layoutElement.y), asc(layoutElement.x), asc(layoutElement.id));
    return drawOrder(
      rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        seatId: r.seatId,
        cubicleId: r.cubicleId,
        label: r.area ?? r.seatLabel ?? r.cubicleName ?? '',
        x: r.x,
        y: r.y,
        w: r.w,
        h: r.h,
      })),
    );
  }

  private async load(tx: Reader, spaceId: string): Promise<OwnerLayout> {
    const [layout] = await tx.select().from(spaceLayout).where(eq(spaceLayout.spaceId, spaceId));
    const elements = await this.elementsOf(tx, spaceId);
    const placed = elements.flatMap((e) => (e.seatId ? [e.seatId] : []));
    const unplaced = await tx
      .select({ id: seat.id })
      .from(seat)
      .where(
        and(
          eq(seat.spaceId, spaceId),
          isNull(seat.removedAt),
          placed.length > 0 ? notInArray(seat.id, placed) : undefined,
        ),
      )
      .orderBy(asc(sql`lower(${seat.label})`), asc(seat.id));
    return {
      columns: layout?.columns ?? DEFAULT_COLUMNS,
      rows: layout?.rows ?? DEFAULT_ROWS,
      version: layout?.version ?? 0,
      elements,
      unplacedSeatIds: unplaced.map((s) => s.id),
    };
  }

  async getOwner(ownerId: string, spaceId: string): Promise<OwnerLayout> {
    const [owned] = await this.db
      .select({ id: space.id })
      .from(space)
      .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)));
    if (!owned) throw new NotFoundException();
    return this.load(this.db, spaceId);
  }

  async save(ownerId: string, spaceId: string, input: SaveLayoutInput): Promise<OwnerLayout> {
    const out = await this.db.transaction(async (tx) => {
      // Same lock as the seat and cubicle writers (R-15): no seat disappears mid-save.
      const owned = await tx
        .select({ id: space.id })
        .from(space)
        .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)))
        .for('update');
      if (owned.length === 0) throw new NotFoundException();

      const [current] = await tx.select().from(spaceLayout).where(eq(spaceLayout.spaceId, spaceId));
      const version = current?.version ?? 0;
      if (input.version !== version) throw staleVersion();

      const seatIds = input.elements.flatMap((e) => (e.seatId ? [e.seatId] : []));
      const cubicleIds = input.elements.flatMap((e) => (e.cubicleId ? [e.cubicleId] : []));
      if (
        new Set(seatIds).size !== seatIds.length ||
        new Set(cubicleIds).size !== cubicleIds.length
      ) {
        throw new BadRequestException('A seat or cubicle can be placed once');
      }
      const seats =
        seatIds.length === 0
          ? []
          : await tx
              .select({ id: seat.id, cubicleId: seat.cubicleId })
              .from(seat)
              .where(
                and(inArray(seat.id, seatIds), eq(seat.spaceId, spaceId), isNull(seat.removedAt)),
              );
      const cubicles =
        cubicleIds.length === 0
          ? []
          : await tx
              .select({ id: cubicle.id })
              .from(cubicle)
              .where(
                and(
                  inArray(cubicle.id, cubicleIds),
                  eq(cubicle.spaceId, spaceId),
                  isNull(cubicle.removedAt),
                ),
              );
      if (seats.length !== seatIds.length || cubicles.length !== cubicleIds.length) {
        throw new NotFoundException();
      }

      const cubicleOfSeat = new Map(seats.map((s) => [s.id, s.cubicleId]));
      const rects = new Map(
        input.elements.flatMap((e) => (e.cubicleId ? [[e.cubicleId, e] as const] : [])),
      );
      for (const e of input.elements) {
        if (e.x + e.w > input.columns || e.y + e.h > input.rows) throw outOfBounds();
        // A cubicle that is not on the plan imposes no check (OQ-T61-3).
        const parent = e.seatId ? rects.get(cubicleOfSeat.get(e.seatId) ?? '') : undefined;
        if (
          parent &&
          (e.x < parent.x ||
            e.y < parent.y ||
            e.x + e.w > parent.x + parent.w ||
            e.y + e.h > parent.y + parent.h)
        ) {
          throw outOfBounds();
        }
      }

      await tx
        .insert(spaceLayout)
        .values({ spaceId, columns: input.columns, rows: input.rows, version: version + 1 })
        .onConflictDoUpdate({
          target: spaceLayout.spaceId,
          set: {
            columns: input.columns,
            rows: input.rows,
            version: version + 1,
            updatedAt: sql`now()`,
          },
        });
      await tx.delete(layoutElement).where(eq(layoutElement.spaceId, spaceId));
      if (input.elements.length > 0) {
        await tx.insert(layoutElement).values(
          input.elements.map((e) => ({
            spaceId,
            kind: e.kind,
            seatId: e.seatId ?? null,
            cubicleId: e.cubicleId ?? null,
            label: e.label ?? null,
            x: e.x,
            y: e.y,
            w: e.w,
            h: e.h,
          })),
        );
      }
      return this.load(tx, spaceId);
    });
    this.logger.info(
      { spaceId, ownerId, version: out.version, elements: out.elements.length },
      'layout.saved',
    );
    return out;
  }

  /** Renter plan: only a published space with at least one element has one (AC 8.5). */
  async getListing(spaceId: string): Promise<ListingLayout> {
    const [row] = await this.db
      .select({ columns: spaceLayout.columns, rows: spaceLayout.rows })
      .from(spaceLayout)
      .innerJoin(space, eq(space.id, spaceLayout.spaceId))
      .where(and(eq(spaceLayout.spaceId, spaceId), eq(space.status, 'published')));
    if (!row) throw new NotFoundException();
    const elements = await this.elementsOf(this.db, spaceId);
    if (elements.length === 0) throw new NotFoundException();
    return {
      columns: row.columns,
      rows: row.rows,
      elements: elements.map(({ kind, seatId, label, x, y, w, h }) => ({
        kind,
        seatId,
        label,
        x,
        y,
        w,
        h,
      })),
    };
  }
}
