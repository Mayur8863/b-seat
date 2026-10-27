import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import type { Database } from '../db/db.js';
import { DB } from '../db/db.module.js';
import { renterPreference } from '../db/schema/index.js';
import type { Preferences, UpdatePreferencesInput } from './me.schemas.js';

@Injectable()
export class MeService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async getPreferences(userId: string): Promise<Preferences | null> {
    const [row] = await this.db
      .select({
        country: renterPreference.country,
        city: renterPreference.city,
        area: renterPreference.area,
      })
      .from(renterPreference)
      .where(eq(renterPreference.userId, userId));
    return row ?? null;
  }

  async savePreferences(userId: string, input: UpdatePreferencesInput): Promise<Preferences> {
    const [row] = await this.db
      .insert(renterPreference)
      .values({ ...input, userId })
      .onConflictDoUpdate({
        target: renterPreference.userId,
        set: { ...input, updatedAt: sql`now()` },
      })
      .returning({
        country: renterPreference.country,
        city: renterPreference.city,
        area: renterPreference.area,
      });
    if (!row) throw new Error('renter_preference upsert returned no row');
    return row;
  }
}
