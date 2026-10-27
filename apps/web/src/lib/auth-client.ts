import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/** Better Auth browser client. Same-origin: /api/auth/* is proxied to the API. */
export const authClient = createAuthClient({
  plugins: [
    // Mirrors the API's additional field (ADR-0010) so sign-up is typed with `accountType`.
    inferAdditionalFields({
      user: { accountType: { type: ['owner', 'renter'], required: true } },
    }),
  ],
});
