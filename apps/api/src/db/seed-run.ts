import { z } from 'zod';

import { seedDemoPasswordField } from '../config/seed-password.js';
import type { Database } from './db.js';
import { seedAccounts } from './demo-accounts.js';
import { seedPhotos, storageFromEnv, type PhotoStore } from './demo-photos.js';
import { assertSeedSpaces, DEMO_SPACES, seedSpaces } from './demo-spaces.js';
import { SeedError } from './seed-error.js';

/** The seed does not call loadEnv: it must run with only these variables (and never in production). */
const seedEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SEED_DEMO_PASSWORD: seedDemoPasswordField.refine((v) => v !== undefined, {
    message: 'SEED_DEMO_PASSWORD is required (see .env.example)',
  }),
});

/** An allow-list, so `prod`, `staging` or `Production` are refused too. */
const SEEDABLE_ENVS: readonly (string | undefined)[] = [undefined, 'development', 'test'];

export interface SeedConnection {
  db: Database;
  close: () => Promise<void>;
}

/**
 * Validates, then opens the DB and seeds accounts and spaces in one transaction. Refuses any
 * environment but development and test before reading anything else; there is no override.
 */
export async function runSeed(
  env: Record<string, string | undefined>,
  connect: (databaseUrl: string) => SeedConnection,
  store: () => PhotoStore = () => storageFromEnv(env),
): Promise<void> {
  if (!SEEDABLE_ENVS.includes(env.NODE_ENV)) {
    throw new SeedError(
      'seed: refusing to run unless NODE_ENV is unset, development or test (demo data is for dev only)',
    );
  }
  const parsed = seedEnvSchema.safeParse({
    DATABASE_URL: env.DATABASE_URL,
    SEED_DEMO_PASSWORD: env.SEED_DEMO_PASSWORD,
  });
  if (!parsed.success) {
    // Issue messages are ours, so they never echo the password.
    throw new SeedError(`seed: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }
  const password = parsed.data.SEED_DEMO_PASSWORD;
  if (password === undefined) throw new SeedError('seed: SEED_DEMO_PASSWORD is required');
  assertSeedSpaces(DEMO_SPACES);

  const { db, close } = connect(parsed.data.DATABASE_URL);
  try {
    const ownerId = await db.transaction(async (tx) => {
      const accounts = await seedAccounts(tx, password);
      await seedSpaces(tx, accounts.ownerId);
      return accounts.ownerId;
    });
    // Outside the transaction: storage calls must not hold a connection, and a storage outage
    // leaves the accounts and spaces committed so a re-run only adds the photos.
    await seedPhotos(db, store(), ownerId);
  } finally {
    await close();
  }
}
