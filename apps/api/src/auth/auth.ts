import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { z } from 'zod';

import type { Env } from '../config/env.js';
import type { Database } from '../db/db.js';
import * as schema from '../db/schema/index.js';
import type { MailJob } from '../mail/mail.types.js';

export const AUTH_BASE_PATH = '/api/auth';

export interface AuthDeps {
  db: Database;
  env: Pick<Env, 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL' | 'TRUSTED_ORIGINS' | 'NODE_ENV'>;
  sendMail: (job: MailJob) => Promise<void>;
}

/** Better Auth instance. Mounted at /api/auth/* in main.ts (see ADR-0004). */
export function createAuth({ db, env, sendMail }: AuthDeps) {
  return betterAuth({
    appName: 'BSeat',
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: env.TRUSTED_ORIGINS,
    telemetry: { enabled: false },
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      requireEmailVerification: env.NODE_ENV === 'production',
      sendResetPassword: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: 'Reset your BSeat password',
          text: `Reset your password: ${url}\n\nIf you didn't ask for this, ignore this email.`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendMail({
          to: user.email,
          subject: 'Verify your BSeat email',
          text: `Welcome to BSeat! Verify your email: ${url}`,
        });
      },
    },
    user: {
      additionalFields: {
        accountType: {
          type: ['owner', 'renter'],
          required: true,
          input: true,
          validator: { input: z.enum(['owner', 'renter']) },
          // No defaultValue on purpose: a JS default would satisfy `required` and skip the choice.
        },
      },
    },
    databaseHooks: {
      user: {
        update: {
          // Must throw: returning false only aborts the write while update-user still reports success (ADR-0010).
          before: (data) => {
            if (data.accountType !== undefined) {
              throw new APIError('BAD_REQUEST', { message: 'accountType cannot be changed' });
            }
            return Promise.resolve();
          },
        },
      },
    },
    rateLimit: { enabled: env.NODE_ENV === 'production' },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production',
      cookiePrefix: 'bseat',
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
