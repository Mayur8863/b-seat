import type { NestExpressApplication } from '@nestjs/platform-express';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEMO_SPACES, type SeedSpace, seedSpaces } from '../src/db/demo-spaces.js';
import { seat, space } from '../src/db/schema/index.js';
import { testDb } from './fixtures.js';
import { createTestApp, resetDb } from './helpers.js';

describe('seedSpaces (demo data, FR-012)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  async function snapshot() {
    const db = testDb(app);
    const spaces = await db.select().from(space).orderBy(asc(space.name));
    const seats = await db
      .select({ spaceName: space.name, label: seat.label, features: seat.features })
      .from(seat)
      .innerJoin(space, eq(seat.spaceId, space.id))
      .orderBy(asc(space.name), asc(seat.label));
    return { spaces, seats };
  }

  it('creates London HQ (12 seats) and Pune Hub (8 seats), and is idempotent', async () => {
    const db = testDb(app);
    await seedSpaces(db);
    const first = await snapshot();
    await seedSpaces(db);
    const second = await snapshot();

    expect(second).toEqual(first);
    expect(second.spaces.map((s) => [s.name, s.location, s.timeZone])).toEqual([
      ['London HQ', 'London, United Kingdom', 'Europe/London'],
      ['Pune Hub', 'Pune, India', 'Asia/Kolkata'],
    ]);
    expect(second.seats).toHaveLength(20);

    const labels = (name: string) =>
      second.seats.filter((s) => s.spaceName === name).map((s) => s.label);
    expect(labels('London HQ')).toEqual(
      Array.from({ length: 12 }, (_, i) => `A-${String(i + 1).padStart(2, '0')}`),
    );
    expect(labels('Pune Hub')).toEqual(
      Array.from({ length: 8 }, (_, i) => `P-${String(i + 1).padStart(2, '0')}`),
    );

    const features = new Set(second.seats.flatMap((s) => s.features));
    expect(features).toEqual(new Set(['standing desk', 'dual monitor']));
  });

  it('fills in a space that exists with missing seats without duplicating it', async () => {
    const db = testDb(app);
    const london = DEMO_SPACES.filter((s) => s.name === 'London HQ');
    await seedSpaces(
      db,
      london.map((s) => ({ ...s, seats: s.seats.slice(0, 3) })),
    );
    await seedSpaces(db);

    const { spaces, seats } = await snapshot();
    expect(spaces).toHaveLength(2);
    expect(seats).toHaveLength(20);
  });

  it('rejects an invalid time zone, naming it, before writing anything', async () => {
    const db = testDb(app);
    const bad: SeedSpace = {
      name: 'Mars Base',
      location: 'Mars',
      timeZone: 'Mars/Base',
      seats: [{ label: 'M-01' }],
    };

    await expect(seedSpaces(db, [...DEMO_SPACES, bad])).rejects.toThrow(/Mars\/Base/);

    const { spaces, seats } = await snapshot();
    expect(spaces).toHaveLength(0);
    expect(seats).toHaveLength(0);
  });
});
