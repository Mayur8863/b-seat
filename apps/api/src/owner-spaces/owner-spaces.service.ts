import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import { PinoLogger } from 'nestjs-pino';

import { publishIncomplete } from '../common/errors/problem-types.js';
import { Clock } from '../common/time/clock.js';
import { toLocal } from '../common/time/zoned-time.js';
import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import { availabilityCalendar, passPrice, space, spaceSlot } from '../db/schema/index.js';
import { formatDecimal, parseDecimal } from '../common/money/money.js';
import type { SlotKind } from '../marketplace/slots.js';
import type {
  CreateSpaceInput,
  OwnerSpace,
  OwnerSpaceList,
  SpacePricing,
  UpdatePricingInput,
  UpdateSpaceInput,
} from './owner-spaces.schemas.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];
type OpeningHours = CreateSpaceInput['openingHours'];

const SLOTS_BY_MODE: Record<OpeningHours['mode'], SlotKind[]> = {
  always_open: ['day', 'night', 'full_day'],
  fixed_hours: ['working_hours'],
};

const slotList = (mode: OpeningHours['mode']) =>
  sql.join(
    SLOTS_BY_MODE[mode].map((slot) => sql`${slot}`),
    sql`, `,
  );

const hhmm = (value: string | null): string => (value ?? '').slice(0, 5);

// Counted in SQL so a listing read is one round trip. Drizzle renders column references
// unqualified inside a single-table select, so the correlated subqueries spell out every column.
const seatCount = sql<number>`(select count(*)::int from "seat" where "seat"."space_id" = "space"."id" and "seat"."removed_at" is null)`;
// FR-011 / data-model "offered": the slot belongs to the opening mode, is enabled and has a price.
const hasOfferedPass = sql<boolean>`exists (
  select 1 from "space_slot" join "pass_price"
    on "pass_price"."space_id" = "space_slot"."space_id" and "pass_price"."slot" = "space_slot"."slot"
  where "space_slot"."space_id" = "space"."id" and "space_slot"."enabled"
    and (("space"."opening_mode" = 'always_open' and "space_slot"."slot" in (${slotList('always_open')}))
      or ("space"."opening_mode" = 'fixed_hours' and "space_slot"."slot" in (${slotList('fixed_hours')}))))`;

export function openingHoursOf(row: {
  openingMode: 'always_open' | 'fixed_hours' | null;
  shiftChangeAt: string | null;
  opensAt: string | null;
  closesAt: string | null;
}): OwnerSpace['openingHours'] {
  return row.openingMode === 'fixed_hours'
    ? { mode: 'fixed_hours', opensAt: hhmm(row.opensAt), closesAt: hhmm(row.closesAt) }
    : { mode: 'always_open', shiftChangeAt: hhmm(row.shiftChangeAt) };
}

const PASSES = ['day', 'week', 'month'] as const;

const plusHalfDay = (time: string): string =>
  `${String((Number(time.slice(0, 2)) + 12) % 24).padStart(2, '0')}${time.slice(2)}`;

/** Slot times in the space's local wall clock; the day boundary is the shift change (R-4). */
export function slotTimes(hours: OwnerSpace['openingHours'], slot: SlotKind) {
  if (hours.mode === 'fixed_hours') {
    return { startTime: hours.opensAt, endTime: hours.closesAt, endsNextDay: false };
  }
  const shift = hours.shiftChangeAt;
  const half = plusHalfDay(shift);
  if (slot === 'day') return { startTime: shift, endTime: half, endsNextDay: false };
  if (slot === 'night') return { startTime: half, endTime: shift, endsNextDay: true };
  return { startTime: shift, endTime: shift, endsNextDay: true };
}

@Injectable()
export class OwnerSpacesService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OwnerSpacesService.name);
  }

  async list(ownerId: string): Promise<OwnerSpaceList> {
    const now = this.clock.now().toISOString();
    const rows = await this.db
      .select({
        id: space.id,
        status: space.status,
        name: space.name,
        city: space.city,
        area: space.area,
        country: space.country,
        seatCount,
        hasOfferedPass,
        // A pass spans at most 30 days, so a booking that has not ended started within the last 31
        // days. The lower bound on starts_at lets booking_space_id_starts_at_idx range-scan.
        upcomingBookingCount: sql<number>`(select count(*)::int from "booking" where "booking"."space_id" = "space"."id" and "booking"."kind" = 'pass' and "booking"."status" = 'active' and "booking"."starts_at" > ${now}::timestamptz - interval '32 days' and "booking"."ends_at" > ${now}::timestamptz)`,
      })
      .from(space)
      .where(eq(space.ownerId, ownerId))
      .orderBy(asc(sql`lower(${space.name})`), asc(space.name), asc(space.id));
    return {
      items: rows.map((r) => ({
        ...r,
        city: r.city ?? '',
        area: r.area ?? '',
        country: r.country ?? '',
      })),
    };
  }

  get(ownerId: string, spaceId: string): Promise<OwnerSpace> {
    return this.load(ownerId, spaceId);
  }

  async create(ownerId: string, input: CreateSpaceInput): Promise<OwnerSpace> {
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(space)
        .values({
          ownerId,
          status: 'draft',
          name: input.name,
          description: input.description,
          country: input.country,
          city: input.city,
          area: input.area,
          streetAddress: input.streetAddress,
          timeZone: input.timeZone,
          currency: input.currency,
          utilities: input.utilities,
          customUtilities: input.customUtilities,
          ...this.openingColumns(input.openingHours),
        })
        .returning({ id: space.id });
      if (!row) throw new Error('space insert returned no row');
      await tx.insert(availabilityCalendar).values({
        spaceId: row.id,
        startDate: toLocal(this.clock.now(), input.timeZone).date,
      });
      await this.ensureSlotRows(tx, row.id, input.openingHours.mode);
      return row.id;
    });
    this.logger.info({ spaceId: id, ownerId }, 'listing.created');
    return this.load(ownerId, id);
  }

  async update(ownerId: string, spaceId: string, input: UpdateSpaceInput): Promise<OwnerSpace> {
    await this.db.transaction(async (tx) => {
      const { openingHours, ...rest } = input;
      const set = {
        ...(rest.name !== undefined && { name: rest.name }),
        ...(rest.description !== undefined && { description: rest.description }),
        ...(rest.country !== undefined && { country: rest.country }),
        ...(rest.city !== undefined && { city: rest.city }),
        ...(rest.area !== undefined && { area: rest.area }),
        ...(rest.streetAddress !== undefined && { streetAddress: rest.streetAddress }),
        ...(rest.timeZone !== undefined && { timeZone: rest.timeZone }),
        ...(rest.currency !== undefined && { currency: rest.currency }),
        ...(rest.utilities !== undefined && { utilities: rest.utilities }),
        ...(rest.customUtilities !== undefined && { customUtilities: rest.customUtilities }),
        ...(openingHours !== undefined && this.openingColumns(openingHours)),
      };
      const updated = await tx
        .update(space)
        .set({ ...set, updatedAt: sql`now()` })
        .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)))
        .returning({ id: space.id });
      if (updated.length === 0) throw this.notFound();
      if (openingHours) await this.ensureSlotRows(tx, spaceId, openingHours.mode);
    });
    return this.load(ownerId, spaceId);
  }

  async publish(ownerId: string, spaceId: string): Promise<OwnerSpace> {
    await this.db.transaction(async (tx) => {
      // Serialises with other writers of the space row (edit, unpublish, publish) only; it does
      // not block a concurrent seat or price removal. Such a removal is equivalent to
      // publishing first and removing after, which FR-008 allows.
      const [row] = await tx
        .select({ status: space.status, seats: seatCount, priced: hasOfferedPass })
        .from(space)
        .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)))
        .for('update', { of: space });
      if (!row) throw this.notFound();
      // Idempotent: a published space is not re-checked (contract).
      if (row.status === 'published') return;
      const missing: ('seat' | 'pricedPass')[] = [];
      if (row.seats === 0) missing.push('seat');
      if (!row.priced) missing.push('pricedPass');
      const [first, ...others] = missing;
      if (first) throw publishIncomplete([first, ...others]);
      await tx
        .update(space)
        .set({ status: 'published', updatedAt: sql`now()` })
        .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)));
    });
    this.logger.info({ spaceId, ownerId }, 'listing.published');
    return this.load(ownerId, spaceId);
  }

  async unpublish(ownerId: string, spaceId: string): Promise<OwnerSpace> {
    const updated = await this.db
      .update(space)
      .set({ status: 'unpublished', updatedAt: sql`now()` })
      .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId), ne(space.status, 'draft')))
      .returning({ id: space.id });
    // A draft was never published, so it stays a draft; load() still 404s a foreign id.
    if (updated.length > 0) this.logger.info({ spaceId, ownerId }, 'listing.unpublished');
    return this.load(ownerId, spaceId);
  }

  async getPricing(ownerId: string, spaceId: string): Promise<SpacePricing> {
    return this.loadPricing(this.db, ownerId, spaceId);
  }

  async updatePricing(
    ownerId: string,
    spaceId: string,
    input: UpdatePricingInput,
  ): Promise<SpacePricing> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({ mode: space.openingMode })
        .from(space)
        .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)))
        .for('update', { of: space });
      if (!row?.mode) throw this.notFound();
      const kinds = SLOTS_BY_MODE[row.mode];
      const sent = input.slots.map((s) => s.slot);
      if (sent.length !== kinds.length || !kinds.every((k) => sent.includes(k))) {
        throw new BadRequestException(`slots must hold each of ${kinds.join(', ')} exactly once`);
      }
      if (row.mode === 'fixed_hours') {
        if (input.shiftChangeAt !== undefined) {
          throw new BadRequestException('shiftChangeAt only applies to 24-hour spaces');
        }
        if (input.slots.some((s) => !s.enabled)) {
          throw new BadRequestException('working_hours cannot be disabled');
        }
      }
      await tx
        .update(space)
        .set({
          ...(input.shiftChangeAt !== undefined && { shiftChangeAt: input.shiftChangeAt }),
          updatedAt: sql`now()`,
        })
        .where(eq(space.id, spaceId));
      for (const s of input.slots) {
        await tx
          .insert(spaceSlot)
          .values({ spaceId, slot: s.slot, enabled: s.enabled })
          .onConflictDoUpdate({
            target: [spaceSlot.spaceId, spaceSlot.slot],
            set: { enabled: s.enabled },
          });
        for (const pass of PASSES) {
          const price = s.prices[pass];
          if (price === null) {
            await tx
              .delete(passPrice)
              .where(
                and(
                  eq(passPrice.spaceId, spaceId),
                  eq(passPrice.slot, s.slot),
                  eq(passPrice.pass, pass),
                ),
              );
            continue;
          }
          const amount = formatDecimal(parseDecimal(price));
          await tx
            .insert(passPrice)
            .values({ spaceId, slot: s.slot, pass, amount })
            .onConflictDoUpdate({
              target: [passPrice.spaceId, passPrice.slot, passPrice.pass],
              set: { amount, updatedAt: sql`now()` },
            });
        }
      }
    });
    this.logger.info({ spaceId, ownerId }, 'listing.pricing-updated');
    return this.loadPricing(this.db, ownerId, spaceId);
  }

  private async loadPricing(
    db: Database | Tx,
    ownerId: string,
    spaceId: string,
  ): Promise<SpacePricing> {
    const [s] = await db
      .select()
      .from(space)
      .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)));
    if (!s?.openingMode) throw this.notFound();
    const kinds = SLOTS_BY_MODE[s.openingMode];
    const [slots, prices] = await Promise.all([
      db.select().from(spaceSlot).where(eq(spaceSlot.spaceId, spaceId)),
      db
        .select()
        .from(passPrice)
        .where(and(eq(passPrice.spaceId, spaceId), inArray(passPrice.slot, kinds))),
    ]);
    const openingHours = openingHoursOf(s);
    return {
      currency: s.currency ?? '',
      openingHours,
      slots: kinds.map((kind) => {
        const price = (pass: (typeof PASSES)[number]) =>
          prices.find((p) => p.slot === kind && p.pass === pass)?.amount ?? null;
        return {
          slot: kind,
          // A missing row reads as enabled, matching what ensureSlotRows seeds.
          enabled: slots.find((r) => r.slot === kind)?.enabled ?? true,
          ...slotTimes(openingHours, kind),
          prices: { day: price('day'), week: price('week'), month: price('month') },
        };
      }),
    };
  }

  // Identical for another owner's space and an unknown id (FR-009).
  private notFound(): NotFoundException {
    return new NotFoundException('Space not found');
  }

  private openingColumns(hours: OpeningHours) {
    return hours.mode === 'always_open'
      ? {
          openingMode: 'always_open' as const,
          shiftChangeAt: hours.shiftChangeAt,
          opensAt: null,
          closesAt: null,
        }
      : {
          openingMode: 'fixed_hours' as const,
          shiftChangeAt: null,
          opensAt: hours.opensAt,
          closesAt: hours.closesAt,
        };
  }

  // The other mode's rows stay, so a switch back keeps prices and enabled flags.
  private async ensureSlotRows(tx: Tx, spaceId: string, mode: OpeningHours['mode']) {
    await tx
      .insert(spaceSlot)
      .values(SLOTS_BY_MODE[mode].map((slot) => ({ spaceId, slot, enabled: true })))
      .onConflictDoNothing();
  }

  private async load(ownerId: string, spaceId: string): Promise<OwnerSpace> {
    const [row] = await this.db
      .select({ s: space, seatCount, hasOfferedPass })
      .from(space)
      .where(and(eq(space.id, spaceId), eq(space.ownerId, ownerId)));
    if (!row) throw this.notFound();
    const s = row.s;
    return {
      id: s.id,
      status: s.status,
      name: s.name,
      description: s.description ?? '',
      country: s.country ?? '',
      city: s.city ?? '',
      area: s.area ?? '',
      streetAddress: s.streetAddress ?? '',
      timeZone: s.timeZone,
      currency: s.currency ?? '',
      openingHours: openingHoursOf(s),
      utilities: s.utilities as OwnerSpace['utilities'],
      customUtilities: s.customUtilities,
      seatCount: row.seatCount,
      hasOfferedPass: row.hasOfferedPass,
      // The layout tables arrive with the layout feature (US8).
      hasLayout: false,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}
