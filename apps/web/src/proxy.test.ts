import { unstable_doesMiddlewareMatch as doesMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { config, proxy } from './proxy';

describe('proxy', () => {
  it.each([
    '/dashboard',
    '/book',
    '/book/x',
    '/bookings',
    '/find',
    '/spaces/abc',
    '/owner/spaces/new',
    '/owner',
  ])('guards %s', (path) => {
    expect(doesMatch({ config, url: `http://localhost:3000${path}` })).toBe(true);
  });

  it.each(['/booking', '/', '/sign-in', '/finder', '/ownership'])('does not run for %s', (path) => {
    expect(doesMatch({ config, url: `http://localhost:3000${path}` })).toBe(false);
  });

  it.each(['/bookings', '/find', '/owner/spaces/new'])(
    'redirects %s to sign-in with next when there is no session cookie',
    (path) => {
      const response = proxy(new NextRequest(`http://localhost:3000${path}`));
      expect(response.status).toBe(307);
      const location = new URL(response.headers.get('location') ?? '');
      expect(location.pathname).toBe('/sign-in');
      expect(location.searchParams.get('next')).toBe(path);
    },
  );

  it('lets a signed-in request through', () => {
    const request = new NextRequest('http://localhost:3000/book', {
      headers: { cookie: 'bseat.session_token=abc' },
    });
    expect(proxy(request).headers.get('location')).toBeNull();
  });
});
