import type { NestExpressApplication } from '@nestjs/platform-express';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { booking, seatHold, user } from '../src/db/schema/index.js';
import {
  createOwner,
  createPublishedSpace,
  createSeats,
  insertHold,
  insertPassBooking,
  testDb,
} from './fixtures.js';
import { createTestApp, pgFailure, resetDb } from './helpers.js';

describe('booking identity is immutable (ADR-0009 section 3 amendment)', () => {
  let app: NestExpressApplication;
  const db = () => testDb(app);

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(() => resetDb(app));
  afterAll(() => app.close());

  async function world() {
    const space = await createPublishedSpace(db());
    const [s1, s2] = await createSeats(db(), space.id, 2);
    const renter = await createOwner(db(), { accountType: 'renter' });
    const startsAt = new Date('2030-03-04T07:00:00Z');
    const endsAt = new Date('2030-03-04T19:00:00Z');
    const b = await insertPassBooking(db(), {
      seatId: s1?.id ?? '',
      userId: renter.id,
      startsAt,
      endsAt,
    });
    await insertHold(db(), {
      seatId: s1?.id ?? '',
      userId: renter.id,
      bookingId: b.id,
      startsAt,
      endsAt,
    });
    return { space, s2, renter, b };
  }

  it.each(['id', 'seatId', 'userId', 'spaceId'] as const)(
    'updating %s fails 23514 booking_identity_immutable and leaves the holds',
    async (column) => {
      const w = await world();
      const other = await createPublishedSpace(db());
      const another = await createOwner(db(), { accountType: 'renter' });
      const values = {
        id: crypto.randomUUID(),
        seatId: w.s2?.id ?? '',
        userId: another.id,
        spaceId: other.id,
      };
      const failure = await pgFailure(
        db()
          .update(booking)
          .set({ [column]: values[column] })
          .where(eq(booking.id, w.b.id)),
      );
      expect(failure).toEqual({ code: '23514', constraint: 'booking_identity_immutable' });
      const holds = await db().select().from(seatHold).where(eq(seatHold.bookingId, w.b.id));
      expect(holds).toHaveLength(1);
      expect(holds[0]?.active).toBe(true);
    },
  );

  it('cancel still cascades active = false to the holds', async () => {
    const w = await world();
    await db()
      .update(booking)
      .set({ status: 'cancelled', cancelledAt: new Date() })
      .where(eq(booking.id, w.b.id));
    const holds = await db().select().from(seatHold).where(eq(seatHold.bookingId, w.b.id));
    expect(holds.map((h) => h.active)).toEqual([false]);
  });

  it('deleting the renter still cascades to the booking and holds', async () => {
    const w = await world();
    await db().delete(user).where(eq(user.id, w.renter.id));
    expect(await db().select().from(booking).where(eq(booking.id, w.b.id))).toHaveLength(0);
    expect(await db().select().from(seatHold)).toHaveLength(0);
  });
});
