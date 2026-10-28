import { z } from 'zod';

import { seedDemoPasswordField } from './seed-password.js';

const commaList = z.string().transform((s) =>
  s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
);

/** Every environment variable the API reads. Documented in /.env.example. */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().positive().default(3001),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.url(),
    REDIS_URL: z.url(),

    SMTP_HOST: z.string().min(1).default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    MAIL_FROM: z.string().min(1).default('BSeat <no-reply@bseat.local>'),

    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
    BETTER_AUTH_URL: z.url(),
    TRUSTED_ORIGINS: commaList.default(['http://localhost:3000']),
    NEXT_PUBLIC_APP_URL: z.url().default('http://localhost:3000'),

    // Object storage for space photos (ADR-0011). Unset endpoints mean AWS S3, where the task
    // role supplies credentials, so the key pair is dev-only and must be set together.
    S3_ENDPOINT: z.url().optional(),
    S3_PUBLIC_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    S3_BUCKET_PHOTOS: z.string().min(3).default('bseat-photos'),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    // FR-019 caps a photo address's life at one hour; the low end exists for expiry tests.
    PHOTO_URL_TTL_SECONDS: z.coerce.number().int().min(2).max(3600).default(3600),

    // Read by the seed script only; optional so the API itself boots without it. A blank
    // value (e.g. `SEED_DEMO_PASSWORD=` in .env) counts as unset.
    SEED_DEMO_PASSWORD: seedDemoPasswordField,
  })
  .refine(
    (env) => (env.S3_ACCESS_KEY_ID === undefined) === (env.S3_SECRET_ACCESS_KEY === undefined),
    {
      message: 'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be set together',
      path: ['S3_SECRET_ACCESS_KEY'],
    },
  )
  // Demo accounts must never exist in production, so its presence there is a misconfiguration.
  .refine((env) => env.NODE_ENV !== 'production' || env.SEED_DEMO_PASSWORD === undefined, {
    message: 'SEED_DEMO_PASSWORD must not be set in production',
    path: ['SEED_DEMO_PASSWORD'],
  });

export type Env = z.infer<typeof EnvSchema>;

/** Parse and validate the environment; fail fast with a readable error. */
export function loadEnv(source: Record<string, unknown> = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
