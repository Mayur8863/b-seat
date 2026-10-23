import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, expect } from 'vitest';

import { server } from './msw';

// Register jest-dom matchers on *this* package's vitest (types in ./vitest.d.ts).
// Not '@testing-library/jest-dom/vitest': under pnpm peer isolation it can augment a
// different vitest instance than the one the tests import.
expect.extend(matchers);

// jsdom has no ResizeObserver; Radix radios inside a form measure their hidden input with it.
globalThis.ResizeObserver = class {
  observe = () => undefined;
  unobserve = () => undefined;
  disconnect = () => undefined;
};
// jsdom does not implement scrolling.
Element.prototype.scrollIntoView = () => undefined;

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});
