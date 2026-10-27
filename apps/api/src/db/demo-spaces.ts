import { and, asc, eq, isNull, or } from 'drizzle-orm';

import { isValidTimeZone } from '../common/time/zoned-time.js';
import type { SlotKind } from '../marketplace/slots.js';
import type { PassType } from '../marketplace/pass-period.js';
import type { Database } from './db.js';
import {
  availabilityCalendar,
  cubicle,
  passPrice,
  seat,
  space,
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
  utilities: string[];
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
}

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
  },
  {
    name: 'Pune Hub',
    location: 'Pune, India',
    timeZone: 'Asia/Kolkata',
    description: 'A weekday coworking floor in Baner, open 09:00 to 18:00.',
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

/**
 * Makes each demo space a published listing of `ownerId`, keyed by `space.name` among the demo
 * owner's spaces and unowned (001) ones, so it is safe to run on every `docker compose up`.
 *
 * A space the demo owner already holds is left alone, except that its shared calendar is ensured:
 * the owner may have edited it, and re-adding seats would resurrect ones they removed (T003).
 * Every zone is checked before anything is written.
 */
export async function seedSpaces(
  db: Database,
  ownerId: string,
  spaces: readonly SeedSpace[] = DEMO_SPACES,
): Promise<void> {
  const invalid = spaces.filter((s) => !isValidTimeZone(s.timeZone));
  if (invalid.length > 0) {
    const names = invalid.map((s) => `"${s.timeZone}" (${s.name})`).join(', ');
    throw new Error(`seed: invalid IANA time zone ${names}`);
  }

  await db.transaction(async (tx) => {
    for (const demo of spaces) {
      const { seats: seatList, slots, prices, name, location, timeZone, ...listing } = demo;
      // space.name is not unique (OQ-11), so look the demo space up before inserting.
      const candidates = await tx
        .select({ id: space.id, ownerId: space.ownerId })
        .from(space)
        .where(and(eq(space.name, name), or(isNull(space.ownerId), eq(space.ownerId, ownerId))))
        .orderBy(asc(space.createdAt), asc(space.id));
      let row = candidates.find((c) => c.ownerId === ownerId) ?? candidates[0];
      if (!row) {
        [row] = await tx
          .insert(space)
          .values({ name, location, timeZone })
          .returning({ id: space.id, ownerId: space.ownerId });
      }
      if (!row) throw new Error(`seed: space "${name}" was not created`);
      const spaceId = row.id;

      if (row.ownerId === null) {
        // One statement sets the owner and every listing field, as space_owned_complete requires.
        await tx
          .update(space)
          .set({ ...listing, ownerId, status: 'published', updatedAt: new Date() })
          .where(and(eq(space.id, spaceId), isNull(space.ownerId)));

        await tx
          .insert(spaceSlot)
          .values(slots.map((slot) => ({ spaceId, slot, enabled: true })))
          .onConflictDoNothing();
        await tx
          .insert(passPrice)
          .values(prices.map((p) => ({ spaceId, ...p })))
          .onConflictDoNothing();

        const cubicleNames = [...new Set(seatList.flatMap((s) => (s.cubicle ? [s.cubicle] : [])))];
        if (cubicleNames.length > 0) {
          await tx
            .insert(cubicle)
            .values(cubicleNames.map((n) => ({ spaceId, name: n })))
            .onConflictDoNothing({
              target: [cubicle.spaceId, cubicle.name],
              where: isNull(cubicle.removedAt),
            });
        }
        const cubicles = await tx
          .select({ id: cubicle.id, name: cubicle.name })
          .from(cubicle)
          .where(and(eq(cubicle.spaceId, spaceId), isNull(cubicle.removedAt)));
        const cubicleId = new Map(cubicles.map((c) => [c.name, c.id]));

        if (seatList.length > 0) {
          await tx
            .insert(seat)
            .values(
              seatList.map((s) => ({
                spaceId,
                label: s.label,
                features: s.features ?? [],
                cubicleId: s.cubicle ? (cubicleId.get(s.cubicle) ?? null) : null,
              })),
            )
            .onConflictDoNothing({
              target: [seat.spaceId, seat.label],
              where: isNull(seat.removedAt),
            });
        }
      }

      // A fresh `db:seed` creates spaces after the 0007 backfill ran, so it creates the calendar.
      const [calendar] = await tx
        .select({ id: availabilityCalendar.id })
        .from(availabilityCalendar)
        .where(and(eq(availabilityCalendar.spaceId, spaceId), isNull(availabilityCalendar.seatId)))
        .limit(1);
      if (!calendar) {
        await tx.insert(availabilityCalendar).values({
          spaceId,
          startDate: new Date().toISOString().slice(0, 10),
          weekdays: 127,
        });
      }
    }
  });
}
