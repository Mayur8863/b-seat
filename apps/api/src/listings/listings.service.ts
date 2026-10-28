import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { fullDaySaving } from '../common/money/money.js';
import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import { passPrice, space, spaceSlot } from '../db/schema/index.js';
import { offeredSlots } from '../marketplace/slots.js';
import { openingHoursOf, slotTimes } from '../owner-spaces/owner-spaces.service.js';
import type { Listing } from './listings.schemas.js';

const PASSES = ['day', 'week', 'month'] as const;

@Injectable()
export class ListingsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(userId: string, spaceId: string): Promise<Listing> {
    const [s] = await this.db
      .select()
      .from(space)
      .where(and(eq(space.id, spaceId), eq(space.status, 'published')));
    if (!s?.openingMode) throw new NotFoundException('Space not found');

    const [slots, prices] = await Promise.all([
      this.db.select().from(spaceSlot).where(eq(spaceSlot.spaceId, spaceId)),
      this.db.select().from(passPrice).where(eq(passPrice.spaceId, spaceId)),
    ]);
    const openingHours = openingHoursOf(s);
    const priceOf = (slot: string, pass: string) =>
      prices.find((p) => p.slot === slot && p.pass === pass)?.amount ?? null;

    const offers = offeredSlots(openingHours)
      .filter((kind) => slots.find((r) => r.slot === kind)?.enabled ?? true)
      .map((kind) => ({
        slot: kind,
        ...slotTimes(openingHours, kind),
        prices: {
          day: priceOf(kind, 'day'),
          week: priceOf(kind, 'week'),
          month: priceOf(kind, 'month'),
        },
      }))
      .filter((o) => PASSES.some((p) => o.prices[p] !== null));

    const price = (slot: string, pass: (typeof PASSES)[number]) =>
      offers.find((o) => o.slot === slot)?.prices[pass] ?? null;
    const saving = (pass: (typeof PASSES)[number]) => {
      const [day, night, fullDay] = [
        price('day', pass),
        price('night', pass),
        price('full_day', pass),
      ];
      return day && night && fullDay ? fullDaySaving(day, night, fullDay) : null;
    };
    const savings = { day: saving('day'), week: saving('week'), month: saving('month') };

    return {
      id: s.id,
      name: s.name,
      description: s.description ?? '',
      country: s.country ?? '',
      city: s.city ?? '',
      area: s.area ?? '',
      streetAddress: s.streetAddress ?? '',
      timeZone: s.timeZone,
      currency: s.currency ?? '',
      utilities: s.utilities as Listing['utilities'],
      customUtilities: s.customUtilities,
      // The layout tables arrive with the layout feature (US8).
      hasLayout: false,
      openingHours,
      offers,
      fullDaySavings: savings.day || savings.week || savings.month ? savings : null,
      isOwnSpace: s.ownerId === userId,
    };
  }
}
