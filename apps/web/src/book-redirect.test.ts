import { describe, expect, it } from 'vitest';

import config from '../next.config';

describe('/book retirement', () => {
  it('permanently redirects /book and subpaths to /find', async () => {
    const redirects = await config.redirects?.();
    expect(redirects).toContainEqual({
      source: '/book/:path*',
      destination: '/find',
      permanent: true,
    });
  });
});
