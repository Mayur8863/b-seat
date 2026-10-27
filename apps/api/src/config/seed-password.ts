import { z } from 'zod';

/** Better Auth's `minPasswordLength` (auth.ts); the demo password must pass the same rule. */
export const MIN_PASSWORD_LENGTH = 12;

/**
 * The demo-account password, shared by `loadEnv` and the seed (which does not call `loadEnv`).
 * A blank value (e.g. `SEED_DEMO_PASSWORD=` in .env) counts as unset.
 */
export const seedDemoPasswordField = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `SEED_DEMO_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`,
    )
    .optional(),
);
