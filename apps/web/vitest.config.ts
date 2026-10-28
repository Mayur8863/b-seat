import path from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.join(import.meta.dirname, 'src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    // jsdom + user-event forms are CPU-bound; 5s flakes when agents or CI share a host
    testTimeout: 15000,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/app/**/layout.tsx'],
      reporter: ['text-summary', 'lcov', 'json-summary'],
    },
  },
});
