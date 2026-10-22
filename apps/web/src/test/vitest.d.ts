import 'vitest';

import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

// jest-dom matcher types for this package's vitest instance (see setup.ts).
// Empty interfaces are required here: augmentation works by declaration merging.
/* eslint-disable @typescript-eslint/no-empty-object-type */
declare module 'vitest' {
  interface Assertion<T = unknown> extends TestingLibraryMatchers<unknown, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
}
