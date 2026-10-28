import { randomUUID } from 'node:crypto';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  availabilityCalendar,
  booking,
  passPrice,
  seat,
  space,
  spaceSlot,
} from '../src/db/schema/index.js';
import { toLocal } from '../src/common/time/zoned-time.js';
import { createListing, createSeats, insertPassBooking, signedInUser, testDb } from './fixtures.js';
import { createTestApp, resetDb, signedInAgent } from './helpers.js';

const str = (v: unknown): string => {
  if (typeof v !== 'string') throw new Error('expected a string');
  return v;
};

const body = (over: Record<string, unknown> = {}) => ({
  name: 'Baner Hub',
  description: 'A bright shared office.',
  country: 'IN',
  city: 'Pune',
  area: 'Baner',
  streetAddress: '1 Test Road',
  timeZone: 'Asia/Kolkata',
  currency: 'INR',
  openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
  ...over,
});

describe('owner spaces API', () => {
  let app: NestExpressApplication;
  let a: Awaited<ReturnType<typeof signedInAgent>>;
  let aId: string;
  let b: Awaited<ReturnType<typeof signedInAgent>>;
  let renter: Awaited<ReturnType<typeof signedInAgent>>;

  const db = () => testDb(app);

  beforeAll(async () => {
    app = await createTestApp();
  });
  beforeEach(async () => {
    await resetDb(app);
    const pw = 'correct-horse-battery';
    a = await signedInAgent(app, { name: 'A', email: 'a@example.com', password: pw }, 'owner');
    aId = (await a.get('/api/me')).body.id;
    b = await signedInAgent(app, { name: 'B', email: 'b@example.com', password: pw }, 'owner');
    renter = (await signedInUser(app, 'r@example.com')).agent;
  });
  afterAll(() => app.close());

  const create = (over: Record<string, unknown> = {}) =>
    a.post('/api/owner/spaces').send(body(over));

  describe('create', () => {
    it('creates a draft with a shared calendar and slot rows (AC 2.1, 6.1)', async () => {
      const res = await create({ utilities: ['wifi'], customUtilities: ['Quiet room'] });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        status: 'draft',
        name: 'Baner Hub',
        timeZone: 'Asia/Kolkata',
        openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
        seatCount: 0,
        hasOfferedPass: false,
        hasLayout: false,
      });
      const id = res.body.id as string;
      const cals = await db()
        .select()
        .from(availabilityCalendar)
        .where(eq(availabilityCalendar.spaceId, id));
      expect(cals).toHaveLength(1);
      expect(cals[0]).toMatchObject({
        seatId: null,
        endDate: null,
        weekdays: 127,
        startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      expect([
        toLocal(new Date(), 'Asia/Kolkata').date,
        toLocal(new Date(Date.now() - 86_400_000), 'Asia/Kolkata').date,
      ]).toContain(cals[0]?.startDate);
      const slots = await db().select().from(spaceSlot).where(eq(spaceSlot.spaceId, id));
      expect(slots.map((s) => s.slot).sort()).toEqual(['day', 'full_day', 'night']);
      expect(slots.every((s) => s.enabled)).toBe(true);
      const [row] = await db().select().from(space).where(eq(space.id, id));
      expect(row?.ownerId).toBe(aId);
    });

    it('creates fixed hours with a working_hours slot', async () => {
      const res = await create({
        openingHours: { mode: 'fixed_hours', opensAt: '09:00', closesAt: '18:00' },
      }).expect(201);
      const slots = await db()
        .select()
        .from(spaceSlot)
        .where(eq(spaceSlot.spaceId, str(res.body.id)));
      expect(slots.map((s) => s.slot)).toEqual(['working_hours']);
    });

    it('ignores nothing: unknown keys such as ownerId or status are 400', async () => {
      await create({ ownerId: 'x' }).expect(400);
      await create({ status: 'published' }).expect(400);
    });

    it.each([
      ['name missing', { name: undefined }, 'name'],
      ['name too long', { name: 'x'.repeat(101) }, 'name'],
      ['description too long', { description: 'x'.repeat(2001) }, 'description'],
      ['unknown country', { country: 'ZZ' }, 'country'],
      ['invalid time zone', { timeZone: 'Mars/Base' }, 'timeZone'],
      ['not offered time zone', { timeZone: 'Asia/Calcutta' }, 'timeZone'],
      ['unknown currency', { currency: 'XXX' }, 'currency'],
      [
        'closing before opening',
        { openingHours: { mode: 'fixed_hours', opensAt: '18:00', closesAt: '09:00' } },
        'openingHours.closesAt',
      ],
      [
        'shift change after noon',
        { openingHours: { mode: 'always_open', shiftChangeAt: '12:00' } },
        'openingHours.shiftChangeAt',
      ],
      [
        'six custom utilities',
        { customUtilities: ['a', 'b', 'c', 'd', 'e', 'f'] },
        'customUtilities',
      ],
      ['duplicate custom utilities', { customUtilities: ['Quiet', 'quiet'] }, 'customUtilities'],
      ['duplicate utilities', { utilities: ['wifi', 'wifi'] }, 'utilities'],
      ['zero-width space in name', { name: 'Ba\u200Bner' }, 'name'],
    ])('400 for %s', async (_n, over, path) => {
      const res = await create(over);
      expect(res.status).toBe(400);
      expect((res.body.errors as { path: string }[]).map((e) => e.path)).toContain(path);
    });

    it('caps a huge invalid body at a small 400 with at most 20 errors', async () => {
      const res = await create({
        utilities: Array.from({ length: 1000 }, () => 'nope'),
        customUtilities: Array.from({ length: 1000 }, () => ''),
      });
      expect(res.status).toBe(400);
      expect((res.body.errors as unknown[]).length).toBeLessThanOrEqual(20);
      expect(JSON.stringify(res.body).length).toBeLessThan(5000);
    });

    it('accepts a multi-line description and normalises CRLF', async () => {
      const res = await create({ description: 'Line one\r\nLine two\nLine three' }).expect(201);
      expect(res.body.description).toBe('Line one\nLine two\nLine three');
      await create({ description: 'a\u0000b' }).expect(400);
    });

    it.each([
      'name',
      'description',
      'country',
      'city',
      'area',
      'streetAddress',
      'timeZone',
      'currency',
      'openingHours',
    ])('400 when %s is missing', async (field) => {
      const res = await create({ [field]: undefined }).expect(400);
      expect(JSON.stringify(res.body)).toContain(field);
    });

    it('400 names the field', async () => {
      const res = await create({ timeZone: 'Asia/Calcutta' }).expect(400);
      expect(JSON.stringify(res.body)).toContain('timeZone');
    });

    it('accepts UTC (OQ-B)', async () => {
      await create({ timeZone: 'UTC' }).expect(201);
    });

    it('401 without a session, 403 for a renter', async () => {
      await request(app.getHttpServer()).post('/api/owner/spaces').send(body()).expect(401);
      await renter.post('/api/owner/spaces').send(body()).expect(403);
      await renter.get('/api/owner/spaces').expect(403);
    });
  });

  describe('list and get', () => {
    it('lists only the caller spaces ordered by name (AC 1.4)', async () => {
      await create({ name: 'Zeta' }).expect(201);
      await create({ name: 'Alpha' }).expect(201);
      await b
        .post('/api/owner/spaces')
        .send(body({ name: 'Bravo' }))
        .expect(201);
      const res = await a.get('/api/owner/spaces').expect(200);
      expect((res.body.items as { name: string }[]).map((i) => i.name)).toEqual(['Alpha', 'Zeta']);
      expect(res.body.items[0]).toMatchObject({
        status: 'draft',
        seatCount: 0,
        hasOfferedPass: false,
        upcomingBookingCount: 0,
      });
    });

    it('orders names case-insensitively', async () => {
      await create({ name: 'banana' }).expect(201);
      await create({ name: 'Cherry' }).expect(201);
      await create({ name: 'Apple' }).expect(201);
      const res = await a.get('/api/owner/spaces').expect(200);
      expect((res.body.items as { name: string }[]).map((i) => i.name)).toEqual([
        'Apple',
        'banana',
        'Cherry',
      ]);
    });

    it('counts only active pass bookings that have not ended', async () => {
      const id = (await create().expect(201)).body.id as string;
      const [s] = await createSeats(db(), id, 1);
      if (!s) throw new Error('no seat');
      const { userId } = await signedInUser(app, 'bk@example.com');
      const day = (d: string) => ({
        seatId: s.id,
        userId,
        startsAt: new Date(`${d}T00:00:00Z`),
        endsAt: new Date(`${d}T23:00:00Z`),
      });
      await insertPassBooking(db(), day('2030-01-01'));
      await insertPassBooking(db(), day('2030-01-02'));
      await insertPassBooking(db(), { ...day('2030-01-03'), status: 'cancelled' });
      await insertPassBooking(db(), day('2020-01-01'));
      const res = await a.get('/api/owner/spaces').expect(200);
      expect(res.body.items[0].upcomingBookingCount).toBe(2);
    });

    it('does not count removed seats in seatCount', async () => {
      const id = (await create().expect(201)).body.id as string;
      const [one, two] = await createSeats(db(), id, 2);
      await db()
        .update(seat)
        .set({ removedAt: new Date() })
        .where(eq(seat.id, two?.id ?? ''));
      const res = await a.get('/api/owner/spaces').expect(200);
      expect(res.body.items[0].seatCount).toBe(1);
      expect(one).toBeDefined();
    });

    it('gets an owned space', async () => {
      const id = (await create().expect(201)).body.id;
      const res = await a.get(`/api/owner/spaces/${id}`).expect(200);
      expect(res.body.id).toBe(id);
    });
  });

  describe('other owner and unknown ids (AC 2.6)', () => {
    it('gives owner B the same 404 as a random uuid on every route', async () => {
      const id = (await create().expect(201)).body.id as string;
      const calls: [string, string, object?][] = [
        ['get', ''],
        ['patch', '', { name: 'Hacked' }],
        ['post', '/publish'],
        ['post', '/unpublish'],
      ];
      for (const [method, suffix, payload] of calls) {
        const send = async (spaceId: string) => {
          const agent = b as unknown as Record<string, (u: string) => request.Test>;
          const t = agent[method]?.(`/api/owner/spaces/${spaceId}${suffix}`);
          if (!t) throw new Error('bad method');
          return payload ? t.send(payload) : t;
        };
        const other = await send(id);
        const random = await send(randomUUID());
        expect(other.status).toBe(404);
        expect(random.status).toBe(404);
        // instance (the path) and requestId differ per request by design.
        const strip = (b: object) => ({ ...b, instance: undefined, requestId: undefined });
        expect(strip(other.body as object)).toEqual(strip(random.body as object));
      }
      const [row] = await db().select().from(space).where(eq(space.id, id));
      expect(row?.name).toBe('Baner Hub');
    });

    it('403 for a renter and 400 for a malformed id', async () => {
      await renter.get(`/api/owner/spaces/${randomUUID()}`).expect(403);
      await renter.post(`/api/owner/spaces/${randomUUID()}/publish`).expect(403);
      await a.get('/api/owner/spaces/not-a-uuid').expect(400);
    });
  });

  describe('patch', () => {
    it('updates given fields, keeps absent ones and moves updatedAt', async () => {
      const created = (await create({ utilities: ['wifi'] }).expect(201)).body;
      const res = await a
        .patch(`/api/owner/spaces/${created.id}`)
        .send({ name: 'New name' })
        .expect(200);
      expect(res.body.name).toBe('New name');
      expect(res.body.utilities).toEqual(['wifi']);
      expect(Date.parse(str(res.body.updatedAt))).toBeGreaterThan(
        Date.parse(str(created.updatedAt)),
      );
    });

    it('updates a multi-line description', async () => {
      const id = (await create().expect(201)).body.id;
      const res = await a
        .patch(`/api/owner/spaces/${id}`)
        .send({ description: 'One\r\nTwo\nThree' })
        .expect(200);
      expect(res.body.description).toBe('One\nTwo\nThree');
    });

    it('400 for an empty body, unknown key, or invalid field', async () => {
      const id = (await create().expect(201)).body.id;
      await a.patch(`/api/owner/spaces/${id}`).send({}).expect(400);
      await a.patch(`/api/owner/spaces/${id}`).send({ status: 'published' }).expect(400);
      await a.patch(`/api/owner/spaces/${id}`).send({ timeZone: 'Asia/Calcutta' }).expect(400);
    });
  });

  describe('publish and unpublish', () => {
    it('422 publish-incomplete lists exactly what is missing (AC 2.4)', async () => {
      const id = (await create().expect(201)).body.id as string;
      const none = await a.post(`/api/owner/spaces/${id}/publish`).expect(422);
      expect(none.body.type).toBe('urn:bseat:problem:listing:publish-incomplete');
      expect(none.body.missing).toEqual(['seat', 'pricedPass']);

      await createSeats(db(), id, 1);
      const noPrice = await a.post(`/api/owner/spaces/${id}/publish`).expect(422);
      expect(noPrice.body.missing).toEqual(['pricedPass']);

      await db().insert(passPrice).values({ spaceId: id, slot: 'day', pass: 'day', amount: '10' });
      await db().update(spaceSlot).set({ enabled: false }).where(eq(spaceSlot.spaceId, id));
      const disabled = await a.post(`/api/owner/spaces/${id}/publish`).expect(422);
      expect(disabled.body.missing).toEqual(['pricedPass']);
    });

    it('publishes with a seat and a price, is idempotent, and unpublish leaves bookings (AC 2.5)', async () => {
      const id = (await create().expect(201)).body.id as string;
      const [s] = await createSeats(db(), id, 1);
      await db().insert(passPrice).values({ spaceId: id, slot: 'day', pass: 'day', amount: '10' });
      const pub = await a.post(`/api/owner/spaces/${id}/publish`).expect(200);
      expect(pub.body).toMatchObject({
        status: 'published',
        seatCount: 1,
        hasOfferedPass: true,
      });
      await a.post(`/api/owner/spaces/${id}/publish`).expect(200);

      if (!s) throw new Error('no seat');
      const { userId } = await signedInUser(app, 'booker@example.com');
      const bk = await insertPassBooking(db(), {
        seatId: s.id,
        userId,
        startsAt: new Date('2030-01-01T00:00:00Z'),
        endsAt: new Date('2030-01-02T00:00:00Z'),
      });
      const unpub = await a.post(`/api/owner/spaces/${id}/unpublish`).expect(200);
      expect(unpub.body.status).toBe('unpublished');
      const [after] = await db().select().from(booking).where(eq(booking.id, bk.id));
      expect(after).toEqual(bk);
    });

    it('unpublish keeps a draft a draft and an unpublished space unpublished', async () => {
      const id = (await create().expect(201)).body.id as string;
      const draft = await a.post(`/api/owner/spaces/${id}/unpublish`).expect(200);
      expect(draft.body.status).toBe('draft');
      await createSeats(db(), id, 1);
      await db().insert(passPrice).values({ spaceId: id, slot: 'day', pass: 'day', amount: '10' });
      await a.post(`/api/owner/spaces/${id}/publish`).expect(200);
      await a.post(`/api/owner/spaces/${id}/unpublish`).expect(200);
      const again = await a.post(`/api/owner/spaces/${id}/unpublish`).expect(200);
      expect(again.body.status).toBe('unpublished');
    });

    it('publishing a published space is 200 even if it no longer has an offered pass', async () => {
      const id = (await create().expect(201)).body.id as string;
      await createSeats(db(), id, 1);
      await db().insert(passPrice).values({ spaceId: id, slot: 'day', pass: 'day', amount: '10' });
      await a.post(`/api/owner/spaces/${id}/publish`).expect(200);
      await a
        .patch(`/api/owner/spaces/${id}`)
        .send({ openingHours: { mode: 'fixed_hours', opensAt: '09:00', closesAt: '17:00' } })
        .expect(200);
      const res = await a.post(`/api/owner/spaces/${id}/publish`).expect(200);
      expect(res.body).toMatchObject({ status: 'published', hasOfferedPass: false });
    });

    it('does not count removed seats', async () => {
      const id = (await create().expect(201)).body.id as string;
      const [s] = await createSeats(db(), id, 1);
      await db().insert(passPrice).values({ spaceId: id, slot: 'day', pass: 'day', amount: '10' });
      await db()
        .update(seat)
        .set({ removedAt: new Date() })
        .where(eq(seat.id, s?.id ?? ''));
      const res = await a.post(`/api/owner/spaces/${id}/publish`).expect(422);
      expect(res.body.missing).toEqual(['seat']);
    });
  });

  describe('switching opening mode (OQ-G)', () => {
    it('stays published and keeps prices across a switch and back', async () => {
      const id = (await create().expect(201)).body.id as string;
      await createSeats(db(), id, 1);
      await db()
        .insert(passPrice)
        .values([
          { spaceId: id, slot: 'day', pass: 'day', amount: '10' },
          { spaceId: id, slot: 'night', pass: 'day', amount: '8' },
          { spaceId: id, slot: 'full_day', pass: 'day', amount: '15' },
        ]);
      await a.post(`/api/owner/spaces/${id}/publish`).expect(200);

      const fixed = await a
        .patch(`/api/owner/spaces/${id}`)
        .send({ openingHours: { mode: 'fixed_hours', opensAt: '09:00', closesAt: '17:00' } })
        .expect(200);
      expect(fixed.body.status).toBe('published');
      expect(fixed.body.hasOfferedPass).toBe(false);
      const rows = await db().select().from(spaceSlot).where(eq(spaceSlot.spaceId, id));
      expect(rows.map((r) => r.slot)).toContain('working_hours');

      const back = await a
        .patch(`/api/owner/spaces/${id}`)
        .send({ openingHours: { mode: 'always_open', shiftChangeAt: '06:00' } })
        .expect(200);
      expect(back.body.status).toBe('published');
      expect(back.body.hasOfferedPass).toBe(true);
      const prices = await db()
        .select()
        .from(passPrice)
        .where(and(eq(passPrice.spaceId, id)));
      expect(prices.map((p) => `${p.slot}:${Number(p.amount)}`).sort()).toEqual([
        'day:10',
        'full_day:15',
        'night:8',
      ]);
    });
  });

  it('does not touch spaces another owner has (list scope with a seeded listing)', async () => {
    const other = await b.get('/api/me');
    await createListing(db(), str(other.body.id), { name: 'B own' });
    const res = await a.get('/api/owner/spaces').expect(200);
    expect(res.body.items).toEqual([]);
  });
});
