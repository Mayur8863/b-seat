import { eq, isNull } from 'drizzle-orm';

import { isValidTimeZone } from '../common/time/zoned-time.js';
import type { Database } from './db.js';
import { seat, space } from './schema/index.js';

/** Demo spaces and seats for local development (FR-012, research R-8). */

export interface SeedSpace {
  name: string;
  location: string;
  /** IANA zone; checked with isValidTimeZone because PostgreSQL cannot. */
  timeZone: string;
  seats: { label: string; features?: string[] }[];
}

const STANDING = 'standing desk';
const DUAL = 'dual monitor';

function seats(
  prefix: string,
  count: number,
  features: Record<number, string[]>,
): SeedSpace['seats'] {
  return Array.from({ length: count }, (_, i) => ({
    label: `${prefix}-${String(i + 1).padStart(2, '0')}`,
    features: features[i + 1] ?? [],
  }));
}

export const DEMO_SPACES: readonly SeedSpace[] = [
  {
    name: 'London HQ',
    location: 'London, United Kingdom',
    timeZone: 'Europe/London',
    seats: seats('A', 12, {
      1: [STANDING],
      2: [DUAL],
      5: [STANDING, DUAL],
      9: [DUAL],
      12: [STANDING],
    }),
  },
  {
    name: 'Pune Hub',
    location: 'Pune, India',
    timeZone: 'Asia/Kolkata',
    seats: seats('P', 8, { 1: [DUAL], 4: [STANDING], 8: [STANDING, DUAL] }),
  },
];

/**
 * Inserts the spaces and their seats if missing, keyed by `space.name` and
 * `(space_id, label)`, so it is safe to run on every `docker compose up`. Existing rows are
 * left untouched. Every zone is checked before anything is written.
 */
export async function seedSpaces(
  db: Database,
  spaces: readonly SeedSpace[] = DEMO_SPACES,
): Promise<void> {
  const invalid = spaces.filter((s) => !isValidTimeZone(s.timeZone));
  if (invalid.length > 0) {
    const names = invalid.map((s) => `"${s.timeZone}" (${s.name})`).join(', ');
    throw new Error(`seed: invalid IANA time zone ${names}`);
  }

  await db.transaction(async (tx) => {
    for (const { seats: seatList, ...values } of spaces) {
      // space.name is no longer unique (OQ-11), so look the demo space up before inserting.
      let [row] = await tx
        .select({ id: space.id })
        .from(space)
        .where(eq(space.name, values.name))
        .limit(1);
      if (!row) [row] = await tx.insert(space).values(values).returning({ id: space.id });
      if (!row) throw new Error(`seed: space "${values.name}" was not created`);
      if (seatList.length === 0) continue;
      await tx
        .insert(seat)
        .values(
          seatList.map((s) => ({ spaceId: row.id, label: s.label, features: s.features ?? [] })),
        )
        .onConflictDoNothing({
          target: [seat.spaceId, seat.label],
          where: isNull(seat.removedAt),
        });
    }
  });
}
