import path from 'node:path';

import type { NextConfig } from 'next';

const monorepoRoot = path.join(import.meta.dirname, '../..');

// Local dev only: proxy /api/* to the API so auth cookies stay same-origin.
// In AWS the load balancer routes /api/* to the API service directly (ADR-0004).
const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';

const config: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  transpilePackages: ['@bseat/ui', '@bseat/api-client'],
  typedRoutes: true,
  poweredByHeader: false,
  // Signed photo URLs must reach the browser directly: an optimizer cache would outlive the
  // 1-hour revocation window (ADR-0011 section 6, FR-019). No remotePatterns on purpose.
  images: { unoptimized: true },
  redirects: () =>
    Promise.resolve([{ source: '/book/:path*', destination: '/find', permanent: true }]),
  rewrites: () => Promise.resolve([{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }]),
};

export default config;
