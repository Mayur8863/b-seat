import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { config, proxy } from './proxy';

describe('proxy', () => {
  it('guards the booking pages', () => {
    expect(config.matcher).toEqual(
      expect.arrayContaining(['/dashboard/:path*', '/book/:path*', '/bookings/:path*']),
    );
  });

  it('redirects to sign-in with next when there is no session cookie', () => {
    const response = proxy(new NextRequest('http://localhost:3000/book'));
    const location = new URL(response.headers.get('location') ?? '');
    expect(location.pathname).toBe('/sign-in');
    expect(location.searchParams.get('next')).toBe('/book');
  });

  it('lets a signed-in request through', () => {
    const request = new NextRequest('http://localhost:3000/book', {
      headers: { cookie: 'bseat.session_token=abc' },
    });
    expect(proxy(request).headers.get('location')).toBeNull();
  });
});
