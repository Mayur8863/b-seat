import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type { Env } from '../../config/env.js';

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SAME_SITE = new Set(['same-origin', 'same-site', 'none']);

interface CsrfRequest {
  method: string;
  path: string;
  secFetchSite: string | undefined;
  origin: string | undefined;
}

/**
 * Cookie sessions make a body-less POST (cancel, publish, unpublish) forgeable from another
 * site, since JSON content-type checks do not apply to it. Browsers state where a request comes
 * from, so refuse the unsafe ones that come from elsewhere. Requests with neither header
 * (server-to-server, tests, curl) pass: they cannot carry a victim's cookie. Better Auth
 * checks its own `/api/auth/*` routes.
 */
export function isCrossSiteWrite(r: CsrfRequest, trustedOrigins: readonly string[]): boolean {
  if (!UNSAFE.has(r.method.toUpperCase())) return false;
  if (r.path.startsWith('/api/auth/') || r.path === '/api/auth') return false;
  if (r.secFetchSite !== undefined && !SAME_SITE.has(r.secFetchSite)) return true;
  return r.origin !== undefined && !trustedOrigins.includes(r.origin);
}

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly trusted: readonly string[];

  constructor(config: ConfigService<Env, true>) {
    this.trusted = config.get('TRUSTED_ORIGINS', { infer: true });
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const header = (name: string) => {
      const v = req.headers[name];
      return Array.isArray(v) ? v[0] : v;
    };
    const blocked = isCrossSiteWrite(
      {
        method: req.method,
        path: req.originalUrl.split('?')[0] ?? '',
        secFetchSite: header('sec-fetch-site'),
        origin: header('origin'),
      },
      this.trusted,
    );
    if (blocked) throw new ForbiddenException('Cross-site request refused');
    return true;
  }
}
