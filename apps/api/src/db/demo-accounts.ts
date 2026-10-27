import { randomUUID } from 'node:crypto';

import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';

import type { AccountType } from '../auth/account-type.js';
import type { DbExecutor } from './db.js';
import { SeedError } from './seed-error.js';
import { account, renterPreference, session, user } from './schema/index.js';

export const DEMO_OWNER_EMAIL = 'owner@bseat.local';
export const DEMO_RENTER_EMAIL = 'renter@bseat.local';

async function upsertCredentialUser(
  db: DbExecutor,
  values: { name: string; email: string; accountType: AccountType },
  password: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: user.id, accountType: user.accountType })
    .from(user)
    .where(eq(user.email, values.email))
    .limit(1);

  if (!existing) {
    const id = randomUUID();
    const passwordHash = await hashPassword(password);
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

  // A real user who happens to hold a demo address must not be taken over.
  if (existing.accountType !== values.accountType) {
    throw new SeedError(
      `seed: ${values.email} already exists as a ${existing.accountType}, expected ${values.accountType}; refusing to touch it`,
    );
  }

  const [credential] = await db
    .select({ id: account.id, password: account.password })
    .from(account)
    .where(and(eq(account.userId, existing.id), eq(account.providerId, 'credential')))
    .limit(1);
  if (!credential) {
    await db.insert(account).values({
      id: randomUUID(),
      accountId: existing.id,
      providerId: 'credential',
      userId: existing.id,
      password: await hashPassword(password),
    });
    return existing.id;
  }

  // The env value is authoritative for demo logins. Only a changed password is rewritten, and
  // then sessions made with the old one are revoked.
  const unchanged =
    credential.password !== null && (await verifyPassword({ hash: credential.password, password }));
  if (!unchanged) {
    await db
      .update(account)
      .set({ password: await hashPassword(password) })
      .where(eq(account.id, credential.id));
    await db.delete(session).where(eq(session.userId, existing.id));
  }
  return existing.id;
}

/** Creates the demo owner and renter (idempotent). The password is hashed the way Better Auth does. */
export async function seedAccounts(
  db: DbExecutor,
  password: string,
): Promise<{ ownerId: string; renterId: string }> {
  const ownerId = await upsertCredentialUser(
    db,
    { name: 'Demo Owner', email: DEMO_OWNER_EMAIL, accountType: 'owner' },
    password,
  );
  const renterId = await upsertCredentialUser(
    db,
    { name: 'Demo Renter', email: DEMO_RENTER_EMAIL, accountType: 'renter' },
    password,
  );
  await db
    .insert(renterPreference)
    .values({ userId: renterId, country: 'IN', city: 'Pune' })
    .onConflictDoNothing();
  return { ownerId, renterId };
}
