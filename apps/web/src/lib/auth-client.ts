import { createAuthClient } from 'better-auth/react';

/** Better Auth browser client. Same-origin: /api/auth/* is proxied to the API. */
export const authClient = createAuthClient();
