import { randomUUID } from 'node:crypto';

import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';

import type { Database } from './db.js';
import { account, renterPreference, user } from './schema/index.js';

export const DEMO_OWNER_EMAIL = 'owner@bseat.local';
export const DEMO_RENTER_EMAIL = 'renter@bseat.local';

async function upsertCredentialUser(
  db: Database,
  values: { name: string; email: string; accountType: 'owner' | 'renter' },
  passwordHash: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, values.email))
    .limit(1);
  if (existing) {
    // The env value is authoritative for demo logins, so a changed password takes effect.
    await db.update(account).set({ password: passwordHash }).where(eq(account.userId, existing.id));
    return existing.id;
  }
  const id = randomUUID();
  await db.insert(user).values({ id, ...values, emailVerified: true });
  await db.insert(account).values({
    id: randomUUID(),
    accountId: id,
    providerId: 'credential',
    userId: id,
    password: passwordHash,
  });
  return id;
}

/** Creates the demo owner and renter (idempotent). The password is hashed the way Better Auth does. */
export async function seedAccounts(
  db: Database,
  password: string,
): Promise<{ ownerId: string; renterId: string }> {
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const ownerId = await upsertCredentialUser(
      tx,
      { name: 'Demo Owner', email: DEMO_OWNER_EMAIL, accountType: 'owner' },
      passwordHash,
    );
    const renterId = await upsertCredentialUser(
      tx,
      { name: 'Demo Renter', email: DEMO_RENTER_EMAIL, accountType: 'renter' },
      passwordHash,
    );
    await tx
      .insert(renterPreference)
      .values({ userId: renterId, country: 'IN', city: 'Pune' })
      .onConflictDoNothing();
    return { ownerId, renterId };
  });
}
