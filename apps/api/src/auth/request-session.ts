import type { Request } from 'express';

import type { AuthSession } from './auth.js';

/*
 * The verified session lives in a module-private WeakMap, not on `req.session`, so no other
 * code (session middleware such as express-session) can plant one that guards would trust.
 */
const attached = new WeakMap<Request, AuthSession>();

export function attachSession(req: Request, session: AuthSession): void {
  attached.set(req, session);
}

export function getAttachedSession(req: Request): AuthSession | undefined {
  return attached.get(req);
}
