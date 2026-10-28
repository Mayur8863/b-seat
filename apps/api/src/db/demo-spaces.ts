import { and, asc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm';

import { isValidTimeZone, toLocal } from '../common/time/zoned-time.js';
import type { SlotKind } from '../marketplace/slots.js';
import type { PassType } from '../marketplace/pass-period.js';
import type { StandardUtility } from '../reference/utilities.js';
import type { DbExecutor } from './db.js';
import { SeedError } from './seed-error.js';
import {
  availabilityCalendar,
  cubicle,
  layoutElement,
  passPrice,
  seat,
  space,
  spaceLayout,
  spaceSlot,
} from './schema/index.js';

/** Demo marketplace listings for local development (FR-012, research R-8, OQ-11). */

interface SeedListing {
  description: string;
  country: string;
  city: string;
  area: string;
  streetAddress: string;
  currency: string;
  openingMode: 'always_open' | 'fixed_hours';
  opensAt?: string;
  closesAt?: string;
  shiftChangeAt?: string;
  utilities: StandardUtility[];
  /** Enabled slot kinds. */
  slots: SlotKind[];
  /** `amount` is a numeric string, never a float. */
  prices: { slot: SlotKind; pass: PassType; amount: string }[];
}

export interface SeedSpace extends SeedListing {
  name: string;
  location: string;
  /** IANA zone; checked with isValidTimeZone because PostgreSQL cannot. */
  timeZone: string;
  seats: { label: string; features?: string[]; cubicle?: string }[];
  /** A sample floor plan, saved once and only when the space has none (T063). */
  layout?: SeedLayout;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Cubicles and seats are placed by name and label; a seat must lie inside its cubicle. */
export interface SeedLayout {
  columns: number;
  rows: number;
  cubicles: (Rect & { name: string })[];
  seats: (Rect & { label: string })[];
  areas: (Rect & { label: string })[];
}

/** Six 2x2 seats in a 3x2 block inside a cubicle whose origin is (x, y). */
function seatBlock(prefix: string, first: number, x: number, y: number): SeedLayout['seats'] {
  return Array.from({ length: 6 }, (_, i) => ({
    label: `${prefix}-${String(first + i).padStart(2, '0')}`,
    x: x + 1 + (i % 3) * 2,
    y: y + 1 + Math.floor(i / 3) * 2,
    w: 2,
    h: 2,
  }));
}

const LONDON_LAYOUT: SeedLayout = {
  columns: 24,
  rows: 16,
  cubicles: [
    { name: 'Quiet Zone', x: 1, y: 1, w: 8, h: 6 },
    { name: 'Collaboration Zone', x: 11, y: 1, w: 8, h: 6 },
  ],
  seats: [...seatBlock('A', 1, 1, 1), ...seatBlock('A', 7, 11, 1)],
  areas: [
    { label: 'Meeting room', x: 1, y: 9, w: 10, h: 5 },
    { label: 'Kitchen', x: 13, y: 9, w: 6, h: 5 },
    { label: 'Entrance', x: 21, y: 1, w: 2, h: 6 },
  ],
};

const STANDING = 'standing desk';
const DUAL = 'dual monitor';

function seats(
  prefix: string,
  count: number,
  features: Record<number, string[]>,
  cubicleOf: (n: number) => string,
): SeedSpace['seats'] {
  return Array.from({ length: count }, (_, i) => ({
    label: `${prefix}-${String(i + 1).padStart(2, '0')}`,
    features: features[i + 1] ?? [],
    cubicle: cubicleOf(i + 1),
  }));
}

export const DEMO_SPACES: readonly SeedSpace[] = [
  {
    name: 'London HQ',
    location: 'London, United Kingdom',
    timeZone: 'Europe/London',
    description: 'A 24-hour shared office in the heart of Westminster.',
    country: 'GB',
    city: 'London',
    area: 'Westminster',
    streetAddress: '1 Victoria Street',
    currency: 'GBP',
    openingMode: 'always_open',
    shiftChangeAt: '07:00',
    utilities: ['wifi', 'tea_coffee', 'security_24h'],
    slots: ['day', 'night', 'full_day'],
    // The 24-hour pass costs less than a day plus a night pass.
    prices: [
      { slot: 'day', pass: 'day', amount: '18.00' },
      { slot: 'day', pass: 'month', amount: '320.00' },
      { slot: 'night', pass: 'day', amount: '14.00' },
      { slot: 'night', pass: 'month', amount: '250.00' },
      { slot: 'full_day', pass: 'day', amount: '25.00' },
      { slot: 'full_day', pass: 'month', amount: '450.00' },
    ],
    seats: seats(
      'A',
      12,
      { 1: [STANDING], 2: [DUAL], 5: [STANDING, DUAL], 9: [DUAL], 12: [STANDING] },
      (n) => (n <= 6 ? 'Quiet Zone' : 'Collaboration Zone'),
    ),
    layout: LONDON_LAYOUT,
  },
  {
    name: 'Pune Hub',
    location: 'Pune, India',
    timeZone: 'Asia/Kolkata',
    description: 'A coworking floor in Baner, open 09:00 to 18:00.',
    country: 'IN',
    city: 'Pune',
    area: 'Baner',
    streetAddress: '12 Baner Road',
    currency: 'INR',
    openingMode: 'fixed_hours',
    opensAt: '09:00',
    closesAt: '18:00',
    utilities: ['wifi', 'air_conditioning', 'power_backup'],
    slots: ['working_hours'],
    prices: [
      { slot: 'working_hours', pass: 'day', amount: '500.00' },
      { slot: 'working_hours', pass: 'week', amount: '2200.00' },
      { slot: 'working_hours', pass: 'month', amount: '7500.00' },
    ],
    seats: seats('P', 8, { 1: [DUAL], 4: [STANDING], 8: [STANDING, DUAL] }, () => 'Main Floor'),
  },
];

/** Throws before anything is written if a demo zone is not an IANA zone. */
export function assertSeedSpaces(spaces: readonly SeedSpace[]): void {
  const invalid = spaces.filter((s) => !isValidTimeZone(s.timeZone));
  if (invalid.length > 0) {
    const names = invalid.map((s) => `"${s.timeZone}" (${s.name})`).join(', ');
    throw new SeedError(`seed: invalid IANA time zone ${names}`);
  }
}

/**
 * Makes each demo space a published listing of `ownerId`, keyed by `space.name` among the demo
 * owner's spaces and unowned (001) ones, so it is safe to run on every `docker compose up`.
 * Renaming a demo space means the next run creates a new one under the old name.
 *
 * Claiming an unowned 001 space completes it in place: seats it already has keep their ids and
 * only gain a cubicle. A space the demo owner already holds is left alone, except that its shared
 * calendar is ensured: the owner may have edited it, and re-adding seats would resurrect ones
 * they removed (T003). The one exception is a repair for spaces claimed by the first seed
 * version: a held space whose active seats sit in no cubicle, and that has no soft-removed
 * cubicle, gets the demo cubicles once (existing seats are updated, never inserted). Side effect:
 * an owner who empties every cubicle (without removing one) gets them refilled. Call inside a transaction (see runSeed) so a failure writes nothing.
 */
export async function seedSpaces(
  db: DbExecutor,
  ownerId: string,
  spaces: readonly SeedSpace[] = DEMO_SPACES,
): Promise<void> {
  assertSeedSpaces(spaces);

  for (const demo of spaces) {
    const { seats: seatList, slots, prices, name, location, timeZone, layout, ...listing } = demo;
    // space.name is not unique (OQ-11), so look the demo space up before inserting.
    const candidates = await db
      .select({ id: space.id, ownerId: space.ownerId })
      .from(space)
      .where(and(eq(space.name, name), or(isNull(space.ownerId), eq(space.ownerId, ownerId))))
      .orderBy(asc(space.createdAt), asc(space.id));
    const found = candidates.find((c) => c.ownerId === ownerId) ?? candidates[0];
    // One statement sets the owner and every listing field, as space_owned_complete requires.
    const complete = { ...listing, ownerId, status: 'published' as const };

    let spaceId: string;
    let seedOwnsSeats: boolean;
    if (!found) {
      const [row] = await db
        .insert(space)
        .values({ name, location, timeZone, ...complete })
        .returning({ id: space.id });
      if (!row) throw new SeedError(`seed: space "${name}" was not created`);
      spaceId = row.id;
      seedOwnsSeats = true;
    } else if (found.ownerId === null) {
      const rows = await db
        .update(space)
        .set({ ...complete, updatedAt: new Date() })
        .where(and(eq(space.id, found.id), isNull(space.ownerId)))
        .returning({ id: space.id });
      if (rows.length === 0) throw new SeedError(`seed: space "${name}" was claimed concurrently`);
      spaceId = found.id;
      seedOwnsSeats = true;
    } else {
      spaceId = found.id;
      seedOwnsSeats = false;
    }

    // Repair for spaces the first seed version seedOwnsSeats: seats but none in a cubicle. Any seat in
    // a cubicle, or any soft-removed cubicle, means the owner organised the space; leave it alone.
    const [placed] = seedOwnsSeats
      ? []
      : await db
          .select({ id: seat.id })
          .from(seat)
          .where(and(eq(seat.spaceId, spaceId), isNotNull(seat.cubicleId)))
          .limit(1);
    const [removedCubicle] = seedOwnsSeats
      ? []
      : await db
          .select({ id: cubicle.id })
          .from(cubicle)
          .where(and(eq(cubicle.spaceId, spaceId), isNotNull(cubicle.removedAt)))
          .limit(1);
    const needsCubicles = seedOwnsSeats || (!placed && !removedCubicle);

    if (seedOwnsSeats) {
      await db
        .insert(spaceSlot)
        .values(slots.map((slot) => ({ spaceId, slot, enabled: true })))
        .onConflictDoNothing();
      await db
        .insert(passPrice)
        .values(prices.map((p) => ({ spaceId, ...p })))
        .onConflictDoNothing();
    }

    if (needsCubicles) {
      const cubicleNames = [...new Set(seatList.flatMap((s) => (s.cubicle ? [s.cubicle] : [])))];
      if (cubicleNames.length > 0) {
        await db
          .insert(cubicle)
          .values(cubicleNames.map((n) => ({ spaceId, name: n })))
          .onConflictDoNothing({
            target: [cubicle.spaceId, cubicle.name],
            where: isNull(cubicle.removedAt),
          });
      }
      const cubicles = await db
        .select({ id: cubicle.id, name: cubicle.name })
        .from(cubicle)
        .where(and(eq(cubicle.spaceId, spaceId), isNull(cubicle.removedAt)));
      const cubicleId = new Map(cubicles.map((c) => [c.name, c.id]));

      if (!seedOwnsSeats) {
        // Repair only: never insert, so a seat the owner removed stays removed.
        for (const s of seatList) {
          const id = s.cubicle ? cubicleId.get(s.cubicle) : undefined;
          if (!id) continue;
          await db
            .update(seat)
            .set({ cubicleId: id })
            .where(
              and(
                eq(seat.spaceId, spaceId),
                eq(seat.label, s.label),
                isNull(seat.removedAt),
                isNull(seat.cubicleId),
              ),
            );
        }
      } else if (seatList.length > 0) {
        await db
          .insert(seat)
          .values(
            seatList.map((s) => ({
              spaceId,
              label: s.label,
              features: s.features ?? [],
              cubicleId: s.cubicle ? (cubicleId.get(s.cubicle) ?? null) : null,
            })),
          )
          // Existing 001 seats keep their ids and only gain the cubicle they lack.
          .onConflictDoUpdate({
            target: [seat.spaceId, seat.label],
            targetWhere: isNull(seat.removedAt),
            set: { cubicleId: sql`excluded.cubicle_id` },
            setWhere: isNull(seat.cubicleId),
          });
      }
    }

    // A fresh `db:seed` creates spaces after the 0007 backfill ran, so it creates the calendar.
    const [calendar] = await db
      .select({ id: availabilityCalendar.id })
      .from(availabilityCalendar)
      .where(and(eq(availabilityCalendar.spaceId, spaceId), isNull(availabilityCalendar.seatId)))
      .limit(1);
    if (!calendar) {
      await db.insert(availabilityCalendar).values({
        spaceId,
        // The space's local date, as the 0007 backfill uses.
        startDate: toLocal(new Date(), timeZone).date,
        weekdays: 127,
      });
    }

    if (layout) await seedLayout(db, spaceId, layout);
  }
}

/**
 * Saves the sample plan only when the space has no layout row, so an owner's edits (even an
 * emptied plan) are never replaced. Seats and cubicles the owner removed are skipped.
 */
async function seedLayout(db: DbExecutor, spaceId: string, layout: SeedLayout): Promise<void> {
  const [existing] = await db
    .select({ spaceId: spaceLayout.spaceId })
    .from(spaceLayout)
    .where(eq(spaceLayout.spaceId, spaceId));
  if (existing) return;

  const seats = await db
    .select({ id: seat.id, label: seat.label })
    .from(seat)
    .where(and(eq(seat.spaceId, spaceId), isNull(seat.removedAt)));
  const cubicles = await db
    .select({ id: cubicle.id, name: cubicle.name })
    .from(cubicle)
    .where(and(eq(cubicle.spaceId, spaceId), isNull(cubicle.removedAt)));
  const seatId = new Map(seats.map((x) => [x.label, x.id]));
  const cubicleId = new Map(cubicles.map((c) => [c.name, c.id]));

  await db
    .insert(spaceLayout)
    .values({ spaceId, columns: layout.columns, rows: layout.rows, version: 1 });
  const elements: (typeof layoutElement.$inferInsert)[] = [
    ...layout.cubicles.flatMap(({ name, ...r }) => {
      const id = cubicleId.get(name);
      return id ? [{ spaceId, kind: 'cubicle' as const, cubicleId: id, ...r }] : [];
    }),
    ...layout.seats.flatMap(({ label, ...r }) => {
      const id = seatId.get(label);
      return id ? [{ spaceId, kind: 'seat' as const, seatId: id, ...r }] : [];
    }),
    ...layout.areas.map((a) => ({ spaceId, kind: 'area' as const, ...a })),
  ];
  await db.insert(layoutElement).values(elements);
}
