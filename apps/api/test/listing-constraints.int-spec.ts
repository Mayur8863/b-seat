import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../src/db/db.js';
import { cubicle, seat, space } from '../src/db/schema/index.js';
import { createCubicle, createListing, createOwner, createSpace, testDb } from './fixtures.js';
import { createTestApp, pgFailure, resetDb } from './helpers.js';

// data-model.md "space (changed)", "cubicle" and "seat (changed)", tested against the migrated database.

describe('listing constraints (database)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let ownerId: string;

  beforeAll(async () => {
    app = await createTestApp();
    db = testDb(app);
  });
  beforeEach(async () => {
    await resetDb(app);
    ownerId = (await createOwner(db)).id;
  });
  afterAll(() => app.close());

  describe('space', () => {
    it('defaults a legacy row to draft with no owner and a nullable location', async () => {
      await expect(createSpace(db, { location: null })).resolves.toMatchObject({
        status: 'draft',
        ownerId: null,
        location: null,
      });
    });

    it('accepts a complete owned listing', async () => {
      const row = await createListing(db, ownerId, { status: 'published' });
      expect(row).toMatchObject({
        ownerId,
        status: 'published',
        utilities: [],
        customUtilities: [],
      });
    });

    it.each([
      'description',
      'country',
      'city',
      'area',
      'streetAddress',
      'currency',
      'openingMode',
    ] as const)('refuses an owned space without %s (space_owned_complete)', async (field) => {
      const failure = await pgFailure(createListing(db, ownerId, { [field]: null }));
      expect(failure).toEqual({ code: '23514', constraint: 'space_owned_complete' });
    });

    it('refuses to null a field of an owned space by update', async () => {
      const row = await createListing(db, ownerId);
      const failure = await pgFailure(
        db.update(space).set({ description: null }).where(eq(space.id, row.id)),
      );
      expect(failure).toEqual({ code: '23514', constraint: 'space_owned_complete' });
    });

    it('refuses a published space without an owner (space_published_has_owner)', async () => {
      const failure = await pgFailure(createSpace(db, { status: 'published' }));
      expect(failure).toEqual({ code: '23514', constraint: 'space_published_has_owner' });
    });

    it.each([
      { name: 'closes_at equal to opens_at', values: { opensAt: '09:00', closesAt: '09:00' } },
      { name: 'closes_at before opens_at', values: { opensAt: '18:00', closesAt: '09:00' } },
      { name: 'fixed hours without opens_at', values: { opensAt: null } },
      {
        name: 'always_open without shift_change_at',
        values: { openingMode: 'always_open' as const },
      },
    ])('refuses $name (space_opening_hours_valid)', async ({ values }) => {
      const failure = await pgFailure(createListing(db, ownerId, values));
      expect(failure).toEqual({ code: '23514', constraint: 'space_opening_hours_valid' });
    });

    it('accepts an always_open space with a shift change time', async () => {
      await expect(
        createListing(db, ownerId, {
          openingMode: 'always_open',
          opensAt: null,
          closesAt: null,
          shiftChangeAt: '07:00',
        }),
      ).resolves.toMatchObject({ openingMode: 'always_open', shiftChangeAt: '07:00:00' });
    });

    it('derives city_key and area_key by trimming and lower-casing', async () => {
      const row = await createListing(db, ownerId, { city: '  Pune ', area: ' BANER ' });
      expect(row).toMatchObject({ cityKey: 'pune', areaKey: 'baner' });
    });

    it('refuses six custom utilities (space_custom_utilities_max) but accepts five', async () => {
      const names = ['a', 'b', 'c', 'd', 'e'];
      await createListing(db, ownerId, { customUtilities: names });
      const failure = await pgFailure(
        createListing(db, ownerId, { customUtilities: [...names, 'f'] }),
      );
      expect(failure).toEqual({ code: '23514', constraint: 'space_custom_utilities_max' });
    });

    it('refuses more than 11 standard utilities (space_utilities_max)', async () => {
      const codes = Array.from({ length: 12 }, (_, i) => `u${i}`);
      const failure = await pgFailure(createListing(db, ownerId, { utilities: codes }));
      expect(failure).toEqual({ code: '23514', constraint: 'space_utilities_max' });
      await createListing(db, ownerId, { utilities: codes.slice(0, 11) });
    });

    it('bounds the total length of custom utilities (space_custom_utilities_length)', async () => {
      await createListing(db, ownerId, { customUtilities: ['x'.repeat(200)] });
      const failure = await pgFailure(
        createListing(db, ownerId, { customUtilities: ['x'.repeat(100), 'y'.repeat(101)] }),
      );
      expect(failure).toEqual({ code: '23514', constraint: 'space_custom_utilities_length' });
    });

    it.each([
      { constraint: 'space_description_length', values: { description: '   ' } },
      { constraint: 'space_description_length', values: { description: 'x'.repeat(2001) } },
      { constraint: 'space_city_length', values: { city: 'x'.repeat(101) } },
      { constraint: 'space_area_length', values: { area: ' ' } },
      { constraint: 'space_street_address_length', values: { streetAddress: 'x'.repeat(201) } },
      { constraint: 'space_country_format', values: { country: 'in' } },
      { constraint: 'space_currency_format', values: { currency: 'inr' } },
    ])('refuses $values ($constraint)', async ({ constraint, values }) => {
      const failure = await pgFailure(createListing(db, ownerId, values));
      expect(failure).toEqual({ code: '23514', constraint });
    });

    it('allows two owners to name spaces alike, and one owner too (OQ-11)', async () => {
      const other = (await createOwner(db)).id;
      await createListing(db, ownerId, { name: 'Cowork Hub' });
      await createListing(db, other, { name: 'Cowork Hub' });
      await createListing(db, ownerId, { name: 'Cowork Hub' });
    });

    it('refuses deleting an owner who has a space (ON DELETE RESTRICT)', async () => {
      await createListing(db, ownerId);
      const failure = await pgFailure(db.execute(sql`delete from "user" where id = ${ownerId}`));
      expect(failure).toEqual({ code: '23001', constraint: 'space_owner_id_user_id_fk' });
    });
  });

  describe('seat', () => {
    it('refuses a second active seat label but allows it after soft removal (R-15)', async () => {
      const sp = await createListing(db, ownerId);
      const [first] = await db.insert(seat).values({ spaceId: sp.id, label: 'A-1' }).returning();
      const failure = await pgFailure(db.insert(seat).values({ spaceId: sp.id, label: 'A-1' }));
      expect(failure).toEqual({ code: '23505', constraint: 'seat_space_id_label_active_unique' });

      await db
        .update(seat)
        .set({ removedAt: new Date() })
        .where(eq(seat.id, first?.id ?? ''));
      await db.insert(seat).values({ spaceId: sp.id, label: 'A-1' });
    });

    it('refuses a seat whose cubicle belongs to another space (composite FK)', async () => {
      const a = await createListing(db, ownerId);
      const b = await createListing(db, ownerId);
      const bay = await createCubicle(db, b.id);
      const failure = await pgFailure(
        db.insert(seat).values({ spaceId: a.id, label: 'A-1', cubicleId: bay.id }),
      );
      expect(failure).toEqual({ code: '23503', constraint: 'seat_cubicle_space_fk' });

      await db.insert(seat).values({ spaceId: b.id, label: 'B-1', cubicleId: bay.id });
    });
  });

  describe('cubicle', () => {
    it('refuses two active cubicles with one name, but not after soft removal', async () => {
      const sp = await createListing(db, ownerId);
      const first = await createCubicle(db, sp.id);
      const failure = await pgFailure(createCubicle(db, sp.id));
      expect(failure).toEqual({ code: '23505', constraint: 'cubicle_space_id_name_active_unique' });

      await db.update(cubicle).set({ removedAt: new Date() }).where(eq(cubicle.id, first.id));
      await createCubicle(db, sp.id);
    });

    it('allows the same cubicle name in another space and refuses a blank name', async () => {
      const a = await createListing(db, ownerId);
      const b = await createListing(db, ownerId);
      await createCubicle(db, a.id);
      await createCubicle(db, b.id);
      const failure = await pgFailure(createCubicle(db, a.id, { name: '  ' }));
      expect(failure).toEqual({ code: '23514', constraint: 'cubicle_name_length' });
    });
  });
});
