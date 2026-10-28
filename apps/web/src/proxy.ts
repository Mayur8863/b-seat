import { getSessionCookie } from 'better-auth/cookies';
import { type NextRequest, NextResponse } from 'next/server';

/**
 * Optimistic route guard: redirects to sign-in when there is no session cookie.
 * This is UX only; the API enforces auth on every request.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request, { cookiePrefix: 'bseat' })) return NextResponse.next();

  const signIn = new URL('/sign-in', request.url);
  signIn.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(signIn);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/book/:path*',
    '/find/:path*',
    '/spaces/:path*',
    '/bookings/:path*',
    '/owner/:path*',
  ],
};
