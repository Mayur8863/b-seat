import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../src/db/db.js';
import { renterPreference, user } from '../src/db/schema/index.js';
import { testDb } from './fixtures.js';
import { createTestApp, pgFailure, resetDb } from './helpers.js';

// data-model.md "renter_preference", tested against the migrated database.

describe('renter_preference constraints (database)', () => {
  let app: NestExpressApplication;
  let db: Database;
  const userId = 'user-1';

  beforeAll(async () => {
    app = await createTestApp();
    db = testDb(app);
  });
  beforeEach(async () => {
    await resetDb(app);
    await db.insert(user).values({ id: userId, name: 'Ada', email: 'ada@example.com' });
  });
  afterAll(() => app.close());

  it('accepts an all-null row and valid values', async () => {
    await db.insert(renterPreference).values({ userId });
    const [row] = await db.select().from(renterPreference);
    expect(row).toMatchObject({ userId, country: null, city: null, area: null });
  });

  it('accepts 100-char city and area and a 1-char area', async () => {
    await db
      .insert(renterPreference)
      .values({ userId, country: 'IN', city: 'a'.repeat(100), area: 'a' });
    const [row] = await db.select().from(renterPreference);
    expect(row).toMatchObject({ country: 'IN', city: 'a'.repeat(100), area: 'a' });
  });

  it.each([
    ['lowercase country', { country: 'in' }, 'renter_preference_country_format'],
    ['non-letter country', { country: 'I1' }, 'renter_preference_country_format'],
    ['blank city', { city: '   ' }, 'renter_preference_city_length'],
    ['101-char city', { city: 'a'.repeat(101) }, 'renter_preference_city_length'],
    ['blank area', { area: ' ' }, 'renter_preference_area_length'],
    ['101-char area', { area: 'a'.repeat(101) }, 'renter_preference_area_length'],
  ])('refuses %s', async (_name, values, constraint) => {
    const failure = await pgFailure(db.insert(renterPreference).values({ userId, ...values }));
    expect(failure).toEqual({ code: '23514', constraint });
  });

  it('refuses a row for an unknown user (foreign key)', async () => {
    const failure = await pgFailure(db.insert(renterPreference).values({ userId: 'nobody' }));
    expect(failure).toEqual({
      code: '23503',
      constraint: 'renter_preference_user_id_user_id_fk',
    });
  });

  it('cascades the row when the user is deleted', async () => {
    await db.insert(renterPreference).values({ userId, country: 'IN' });
    await db.delete(user);
    expect(await db.select().from(renterPreference)).toHaveLength(0);
  });
});
