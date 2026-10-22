import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC (not esbuild) so Nest's decorator metadata is emitted in tests.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['src/**/*.spec.ts'] },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/**/*.int-spec.ts'],
          globalSetup: ['test/global-setup.ts'],
          setupFiles: ['test/setup-env.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/instrumentation.ts',
        // thin CLI entrypoints (exercised by compose/CI, not unit-testable)
        'src/scripts/**',
        'src/db/seed.ts',
        'src/db/migrate.ts',
      ],
      reporter: ['text-summary', 'lcov', 'json-summary'],
      // Floor for the whole package; CI also enforces 80% on changed lines (diff-cover).
      thresholds: { lines: 80, statements: 80, functions: 75, branches: 70 },
    },
  },
});
