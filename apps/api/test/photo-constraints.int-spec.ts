import type { NestExpressApplication } from '@nestjs/platform-express';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Database } from '../src/db/db.js';
import { photoObjectPurge, space, spacePhoto } from '../src/db/schema/index.js';
import { testDb } from './fixtures.js';
import { createTestApp, pgFailure, resetDb } from './helpers.js';

// data-model.md "space_photo" and "photo_object_purge", tested against the migrated database.

describe('space photo constraints (database)', () => {
  let app: NestExpressApplication;
  let db: Database;
  let spaceId: string;

  const photo = (position: number, extra: Record<string, unknown> = {}) => ({
    spaceId,
    position,
    displayWidth: 1600,
    displayHeight: 1200,
    ...extra,
  });

  beforeAll(async () => {
    app = await createTestApp();
    db = testDb(app);
  });
  beforeEach(async () => {
    await resetDb(app);
    const [row] = await db
      .insert(space)
      .values({ name: 'HQ', timeZone: 'Europe/London' })
      .returning();
    if (!row) throw new Error('space not created');
    spaceId = row.id;
  });
  afterAll(() => app.close());

  async function seedPhotos(n: number) {
    for (let i = 1; i <= n; i++) await db.insert(spacePhoto).values(photo(i));
  }

  it('accepts positions 1 to 10 and refuses an 11th (range check)', async () => {
    await seedPhotos(10);
    const failure = await pgFailure(db.insert(spacePhoto).values(photo(11)));
    expect(failure).toEqual({ code: '23514', constraint: 'space_photo_position_range' });
  });

  it('refuses position 0', async () => {
    const failure = await pgFailure(db.insert(spacePhoto).values(photo(0)));
    expect(failure).toEqual({ code: '23514', constraint: 'space_photo_position_range' });
  });

  it('refuses a duplicate position', async () => {
    await seedPhotos(1);
    const failure = await pgFailure(db.insert(spacePhoto).values(photo(1)));
    expect(failure).toEqual({ code: '23505', constraint: 'space_photo_position_unique' });
  });

  it('permutes positions in one UPDATE without SET CONSTRAINTS', async () => {
    await seedPhotos(3);
    const rows = await db.select().from(spacePhoto).orderBy(spacePhoto.position);
    const [a, b, c] = rows.map((r) => r.id);
    await db.execute(sql`
      UPDATE space_photo p SET position = v.pos
      FROM (VALUES (${a}::uuid, 3), (${b}::uuid, 1), (${c}::uuid, 2)) v(id, pos)
      WHERE p.id = v.id`);
    const after = await db.select().from(spacePhoto).orderBy(spacePhoto.position);
    expect(after.map((r) => r.id)).toEqual([b, c, a]);
  });

  it('renumbers after a delete in one UPDATE', async () => {
    await seedPhotos(3);
    await db.execute(sql`DELETE FROM space_photo WHERE position = 1`);
    await db.execute(
      sql`UPDATE space_photo SET position = position - 1 WHERE space_id = ${spaceId} AND position > 1`,
    );
    const after = await db.select().from(spacePhoto).orderBy(spacePhoto.position);
    expect(after.map((r) => r.position)).toEqual([1, 2]);
  });

  it('still checks per statement: a transient duplicate fails', async () => {
    await seedPhotos(2);
    const failure = await pgFailure(
      db.execute(sql`UPDATE space_photo SET position = 2 WHERE position = 1`),
    );
    expect(failure).toEqual({ code: '23505', constraint: 'space_photo_position_unique' });
  });

  it.each([
    ['151 chars', 'a'.repeat(151)],
    ['empty', ''],
  ])('refuses a description of %s', async (_n, description) => {
    const failure = await pgFailure(db.insert(spacePhoto).values(photo(1, { description })));
    expect(failure).toEqual({ code: '23514', constraint: 'space_photo_description_length' });
  });

  it('accepts a null and a 150-char description', async () => {
    await db.insert(spacePhoto).values(photo(1));
    await db.insert(spacePhoto).values(photo(2, { description: 'a'.repeat(150) }));
  });

  it('refuses a non-positive display size', async () => {
    const failure = await pgFailure(db.insert(spacePhoto).values(photo(1, { displayWidth: 0 })));
    expect(failure).toEqual({ code: '23514', constraint: 'space_photo_display_size_positive' });
  });

  it('refuses a photo for an unknown space', async () => {
    const failure = await pgFailure(
      db.insert(spacePhoto).values({
        spaceId: '00000000-0000-0000-0000-000000000000',
        position: 1,
        displayWidth: 1,
        displayHeight: 1,
      }),
    );
    expect(failure).toEqual({ code: '23503', constraint: 'space_photo_space_id_space_id_fk' });
  });

  describe('photo_object_purge', () => {
    const purge = (extra: Record<string, unknown> = {}) => ({
      spaceId,
      photoId: '11111111-1111-1111-1111-111111111111',
      reason: 'deleted',
      dueAt: new Date(),
      ...extra,
    });

    it('accepts both reasons with defaults', async () => {
      await db.insert(photoObjectPurge).values(purge());
      await db
        .insert(photoObjectPurge)
        .values(
          purge({ photoId: '22222222-2222-2222-2222-222222222222', reason: 'abandoned_upload' }),
        );
      const [row] = await db.select().from(photoObjectPurge).limit(1);
      expect(row).toMatchObject({ attempts: 0, lastAttemptAt: null });
    });

    it('refuses reason other', async () => {
      const failure = await pgFailure(
        db.insert(photoObjectPurge).values(purge({ reason: 'other' })),
      );
      expect(failure).toEqual({ code: '23514', constraint: 'photo_object_purge_reason_valid' });
    });

    it('refuses negative attempts', async () => {
      const failure = await pgFailure(db.insert(photoObjectPurge).values(purge({ attempts: -1 })));
      expect(failure).toEqual({
        code: '23514',
        constraint: 'photo_object_purge_attempts_nonnegative',
      });
    });

    it('refuses a second purge for the same photo', async () => {
      await db.insert(photoObjectPurge).values(purge());
      const failure = await pgFailure(db.insert(photoObjectPurge).values(purge()));
      expect(failure.code).toBe('23505');
    });
  });
});
