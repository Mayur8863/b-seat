import type { NestExpressApplication } from '@nestjs/platform-express';
import { asc, eq, isNull } from 'drizzle-orm';
import pg from 'pg';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEMO_OWNER_EMAIL, DEMO_RENTER_EMAIL, seedAccounts } from '../src/db/demo-accounts.js';
import { DEMO_SPACES, type SeedSpace, seedSpaces } from '../src/db/demo-spaces.js';
import {
  account,
  availabilityCalendar,
  cubicle,
  passPrice,
  renterPreference,
  seat,
  session,
  space,
  spaceSlot,
  user,
} from '../src/db/schema/index.js';
import { runSeed, type SeedConnection } from '../src/db/seed-run.js';
import { createListing, createOwner, testDb } from './fixtures.js';
import { createTestApp, ORIGIN, resetDb } from './helpers.js';
import { PG_POOL } from '../src/db/db.module.js';

const PASSWORD = 'demo-password-123';
const OTHER_PASSWORD = 'another-demo-password-9';

describe('demo marketplace seed (FR-012, OQ-11)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  /** Mimics the 001 seed: unowned draft spaces with seats. */
  async function insertLegacyDemo() {
    const db = testDb(app);
    for (const s of DEMO_SPACES) {
      const [row] = await db
        .insert(space)
        .values({ name: s.name, location: s.location, timeZone: s.timeZone })
        .returning();
      if (!row) throw new Error('no row');
      await db
        .insert(seat)
        .values(s.seats.slice(0, 2).map((x) => ({ spaceId: row.id, label: x.label })));
    }
  }

  async function snapshot() {
    const db = testDb(app);
    return {
      users: await db.select().from(user).orderBy(asc(user.email)),
      spaces: await db.select().from(space).orderBy(asc(space.name)),
      seats: await db.select().from(seat).orderBy(asc(seat.spaceId), asc(seat.label)),
      cubicles: await db.select().from(cubicle).orderBy(asc(cubicle.name)),
      slots: await db.select().from(spaceSlot),
      prices: await db.select().from(passPrice),
      calendars: await db.select().from(availabilityCalendar),
    };
  }

  async function seedAll() {
    const db = testDb(app);
    const { ownerId } = await seedAccounts(db, PASSWORD);
    await seedSpaces(db, ownerId);
    return ownerId;
  }

  it('seeds 2 accounts, 2 published spaces, 20 seats, prices and one shared calendar each, twice', async () => {
    const ownerId = await seedAll();
    const first = await snapshot();
    await seedAll();
    const second = await snapshot();

    expect(second).toEqual(first);
    expect(second.users.map((u) => [u.email, u.accountType])).toEqual([
      [DEMO_OWNER_EMAIL, 'owner'],
      [DEMO_RENTER_EMAIL, 'renter'],
    ]);
    expect(second.spaces).toHaveLength(2);
    expect(second.spaces.every((s) => s.ownerId === ownerId && s.status === 'published')).toBe(
      true,
    );
    const [london, pune] = second.spaces;
    expect(london).toMatchObject({
      name: 'London HQ',
      country: 'GB',
      city: 'London',
      area: 'Westminster',
      currency: 'GBP',
      openingMode: 'always_open',
      timeZone: 'Europe/London',
    });
    expect(london?.shiftChangeAt?.slice(0, 5)).toBe('07:00');
    expect(pune).toMatchObject({
      country: 'IN',
      city: 'Pune',
      area: 'Baner',
      currency: 'INR',
      openingMode: 'fixed_hours',
      timeZone: 'Asia/Kolkata',
    });
    expect(pune?.opensAt?.slice(0, 5)).toBe('09:00');
    expect(pune?.closesAt?.slice(0, 5)).toBe('18:00');

    expect(second.seats.filter((s) => s.removedAt === null)).toHaveLength(20);
    expect(second.seats.every((s) => s.cubicleId !== null)).toBe(true);
    expect(second.cubicles.length).toBeGreaterThanOrEqual(2);

    // Exactly one shared calendar per space.
    expect(second.calendars.map((c) => c.spaceId).sort()).toEqual(
      second.spaces.map((s) => s.id).sort(),
    );
    expect(second.calendars.every((c) => c.seatId === null)).toBe(true);

    const londonPrices = second.prices.filter((p) => p.spaceId === london?.id);
    const amount = (slot: string, pass: string) =>
      Number(londonPrices.find((p) => p.slot === slot && p.pass === pass)?.amount);
    expect(amount('full_day', 'day')).toBeLessThan(amount('day', 'day') + amount('night', 'day'));
    expect(
      second.prices
        .filter((p) => p.spaceId === pune?.id)
        .map((p) => p.pass)
        .sort(),
    ).toEqual(['day', 'month', 'week']);
    expect(
      second.slots
        .filter((s) => s.spaceId === london?.id)
        .map((s) => s.slot)
        .sort(),
    ).toEqual(['day', 'full_day', 'night']);
  });

  it('gives the renter IN / Pune preferences', async () => {
    await seedAll();
    const db = testDb(app);
    const rows = await db.select().from(renterPreference);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ country: 'IN', city: 'Pune', area: null });
  });

  it('lets both demo accounts sign in with the password', async () => {
    await seedAll();
    for (const email of [DEMO_OWNER_EMAIL, DEMO_RENTER_EMAIL]) {
      await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .set('origin', ORIGIN)
        .send({ email, password: PASSWORD })
        .expect(200);
    }
    const db = testDb(app);
    const accounts = await db.select().from(account);
    expect(accounts.every((a) => a.password !== null && !a.password.includes(PASSWORD))).toBe(true);
  });

  it('claims and completes the 001 demo spaces in place, giving existing seats a cubicle', async () => {
    await insertLegacyDemo();
    const db = testDb(app);
    const before = await db.select({ id: space.id }).from(space).orderBy(asc(space.id));
    const legacySeats = await db.select({ id: seat.id, label: seat.label }).from(seat);
    await seedAll();
    const { spaces, seats } = await snapshot();
    expect(spaces.map((s) => s.id).sort()).toEqual(before.map((b) => b.id).sort());
    expect(spaces.every((s) => s.status === 'published' && s.ownerId !== null)).toBe(true);
    expect(seats).toHaveLength(20);
    expect(seats.every((s) => s.cubicleId !== null)).toBe(true);
    for (const legacy of legacySeats) {
      expect(seats.find((s) => s.label === legacy.label)?.id).toBe(legacy.id);
    }
  });

  it('does not resurrect a seat the owner removed, nor reset an edited listing', async () => {
    await seedAll();
    const db = testDb(app);
    await db.update(seat).set({ removedAt: new Date() }).where(eq(seat.label, 'A-01'));
    await db
      .update(space)
      .set({ description: 'Edited by the owner.' })
      .where(eq(space.name, 'Pune Hub'));
    await seedAll();

    const active = await db.select().from(seat).where(isNull(seat.removedAt));
    expect(active).toHaveLength(19);
    const [pune] = await db.select().from(space).where(eq(space.name, 'Pune Hub'));
    expect(pune?.description).toBe('Edited by the owner.');
  });

  it('gives cubicles once to a space the first seed version claimed with empty cubicles', async () => {
    await seedAll();
    const db = testDb(app);
    await db.update(seat).set({ cubicleId: null });
    await seedAll();
    expect((await snapshot()).seats.every((s) => s.cubicleId !== null)).toBe(true);

    // Once any seat is in a cubicle, later runs leave the rest alone.
    await db.update(seat).set({ cubicleId: null }).where(eq(seat.label, 'A-01'));
    await seedAll();
    const rows = (await snapshot()).seats;
    expect(rows.find((s) => s.label === 'A-01')?.cubicleId).toBeNull();
  });

  it('recreates a missing shared calendar for a space the owner already holds', async () => {
    await seedAll();
    const db = testDb(app);
    await db.delete(availabilityCalendar);
    await seedAll();
    expect(await db.select().from(availabilityCalendar)).toHaveLength(2);
  });

  it('ignores a same-named space of someone else and creates its own', async () => {
    const db = testDb(app);
    const other = await createOwner(db);
    const owned = await createListing(db, other.id, { name: 'London HQ' });
    await seedAll();
    await seedAll();

    const rows = await db.select().from(space).where(eq(space.name, 'London HQ'));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === owned.id)).toMatchObject({ ownerId: other.id });
    expect(await db.select().from(seat).where(eq(seat.spaceId, owned.id))).toHaveLength(0);
  });

  it('refuses a demo email held by an account of the wrong type, changing nothing', async () => {
    const db = testDb(app);
    await createOwner(db, { email: DEMO_OWNER_EMAIL, accountType: 'renter' });
    await expect(seedAccounts(db, PASSWORD)).rejects.toThrow(/owner@bseat\.local.*renter/);
    expect(await db.select().from(account)).toHaveLength(0);
  });

  it('creates a missing credential row and rewrites only the credential password', async () => {
    await seedAll();
    const db = testDb(app);
    const [owner] = await db.select().from(user).where(eq(user.email, DEMO_OWNER_EMAIL));
    if (!owner) throw new Error('no owner');
    await db.delete(account).where(eq(account.userId, owner.id));
    await db.insert(account).values({
      id: 'social-1',
      accountId: 'x',
      providerId: 'github',
      userId: owner.id,
      password: 'untouched',
    });
    await seedAccounts(db, PASSWORD);
    const rows = await db.select().from(account).where(eq(account.userId, owner.id));
    expect(rows.find((r) => r.providerId === 'github')?.password).toBe('untouched');
    expect(rows.find((r) => r.providerId === 'credential')?.password).toBeTruthy();
  });

  function signIn(password: string) {
    return request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('origin', ORIGIN)
      .send({ email: DEMO_OWNER_EMAIL, password });
  }

  it('revokes sessions only when the password changes', async () => {
    await seedAll();
    await signIn(PASSWORD).expect(200);
    const db = testDb(app);
    await seedAll();
    expect(await db.select().from(session)).toHaveLength(1);

    await seedAccounts(db, OTHER_PASSWORD);
    expect(await db.select().from(session)).toHaveLength(0);
    await signIn(OTHER_PASSWORD).expect(200);
    await signIn(PASSWORD).expect(401);
  });

  it('rejects an invalid time zone, naming it, before writing anything', async () => {
    const db = testDb(app);
    const { ownerId } = await seedAccounts(db, PASSWORD);
    const first = DEMO_SPACES[0];
    if (!first) throw new Error('no demo space');
    const bad: SeedSpace = { ...first, name: 'Mars Base', timeZone: 'Mars/Base' };

    await expect(seedSpaces(db, ownerId, [...DEMO_SPACES, bad])).rejects.toThrow(/Mars\/Base/);
    expect((await snapshot()).spaces).toHaveLength(0);
  });
});

describe('runSeed guards', () => {
  const connect = vi.fn<(url: string) => SeedConnection>();
  afterEach(() => connect.mockReset());

  const base = { DATABASE_URL: 'postgres://x', SEED_DEMO_PASSWORD: PASSWORD };

  it('refuses production before opening a pool, with or without the password', async () => {
    for (const env of [
      { ...base, NODE_ENV: 'production' },
      { DATABASE_URL: 'postgres://x', NODE_ENV: 'production' },
    ]) {
      await expect(runSeed(env, connect)).rejects.toThrow(/NODE_ENV/);
    }
    expect(connect).not.toHaveBeenCalled();
  });

  it.each(['prod', 'staging', 'Production', 'production ', ''])(
    'refuses NODE_ENV=%j before opening a pool',
    async (nodeEnv) => {
      await expect(runSeed({ ...base, NODE_ENV: nodeEnv }, connect)).rejects.toThrow(/NODE_ENV/);
      expect(connect).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '', 'short', 'elevenchars'])(
    'rejects SEED_DEMO_PASSWORD=%j naming it, without the value',
    async (pw) => {
      const err = await runSeed({ ...base, SEED_DEMO_PASSWORD: pw }, connect).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(Error);
      const message = err instanceof Error ? err.message : '';
      expect(message).toMatch(/SEED_DEMO_PASSWORD/);
      if (pw) expect(message).not.toContain(pw);
      expect(connect).not.toHaveBeenCalled();
    },
  );

  it('rolls the accounts back when the space seed fails', async () => {
    const app = await createTestApp();
    const pool = app.get<pg.Pool>(PG_POOL);
    try {
      await resetDb(app);
      await pool.query(`create function seed_test_fail() returns trigger language plpgsql
        as $$ begin raise exception 'seed test failure'; end $$`);
      await pool.query(`create trigger seed_test_fail before insert on availability_calendar
        for each row execute function seed_test_fail()`);
      connect.mockReturnValue({ db: testDb(app), close: () => Promise.resolve() });
      await expect(runSeed(base, connect)).rejects.toThrow();
      expect(await testDb(app).select().from(user)).toHaveLength(0);
      expect(await testDb(app).select().from(space)).toHaveLength(0);
    } finally {
      await pool.query('drop trigger if exists seed_test_fail on availability_calendar');
      await pool.query('drop function if exists seed_test_fail()');
      await app.close();
    }
  });

  it('seeds through the connection and never prints the password', async () => {
    const out: string[] = [];
    const spies = (['log', 'warn', 'error', 'info'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void out.push(a.join(' '))),
    );
    const app = await createTestApp();
    try {
      await resetDb(app);
      const db = testDb(app);
      const close = vi.fn(() => Promise.resolve());
      connect.mockReturnValue({ db, close });
      await runSeed(base, connect);
      await runSeed(base, connect);
      expect(close).toHaveBeenCalledTimes(2);
      expect(await db.select().from(space)).toHaveLength(2);
      expect(out.join('\n')).not.toContain(PASSWORD);
    } finally {
      for (const s of spies) s.mockRestore();
      await app.close();
    }
  });
});
