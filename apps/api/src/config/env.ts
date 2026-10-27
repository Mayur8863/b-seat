import { z } from 'zod';

const commaList = z.string().transform((s) =>
  s
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
);

/** Every environment variable the API reads. Documented in /.env.example. */
export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),

  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  MAIL_FROM: z.string().min(1).default('BSeat <no-reply@bseat.local>'),

  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  BETTER_AUTH_URL: z.url(),
  TRUSTED_ORIGINS: commaList.default(['http://localhost:3000']),
  NEXT_PUBLIC_APP_URL: z.url().default('http://localhost:3000'),

  // Read by the seed script only; optional so the API itself boots without it
  // (production never sets it).
  SEED_DEMO_PASSWORD: z
    .string()
    .min(8, 'SEED_DEMO_PASSWORD must be at least 8 characters')
    .optional(),
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
