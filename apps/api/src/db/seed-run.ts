import { z } from 'zod';

import type { Database } from './db.js';
import { seedAccounts } from './demo-accounts.js';
import { seedSpaces } from './demo-spaces.js';

/** The seed does not call loadEnv: it must run with only these variables (and never in production). */
const seedEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SEED_DEMO_PASSWORD: z
    .string({ error: 'SEED_DEMO_PASSWORD is required (see .env.example)' })
    .min(8, 'SEED_DEMO_PASSWORD must be at least 8 characters'),
});

export interface SeedConnection {
  db: Database;
  close: () => Promise<void>;
}

/**
 * Validates, then opens the DB and seeds. Throws messages that name variables but never their
 * values. Refuses production before reading anything else; there is no override.
 */
export async function runSeed(
  env: Record<string, string | undefined>,
  connect: (databaseUrl: string) => SeedConnection,
): Promise<void> {
  if (env.NODE_ENV === 'production') {
    throw new Error('seed: refusing to run with NODE_ENV=production (demo data is for dev only)');
  }
  const parsed = seedEnvSchema.safeParse({
    DATABASE_URL: env.DATABASE_URL,
    // An empty value in .env counts as unset.
    SEED_DEMO_PASSWORD: env.SEED_DEMO_PASSWORD === '' ? undefined : env.SEED_DEMO_PASSWORD,
  });
  if (!parsed.success) {
    // Issue messages are ours, so they never echo the password.
    throw new Error(`seed: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
  }

  const { db, close } = connect(parsed.data.DATABASE_URL);
  try {
    const { ownerId } = await seedAccounts(db, parsed.data.SEED_DEMO_PASSWORD);
    await seedSpaces(db, ownerId);
  } finally {
    await close();
  }
}
