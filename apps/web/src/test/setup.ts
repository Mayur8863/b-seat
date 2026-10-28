import * as matchers from '@testing-library/jest-dom/matchers';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, expect, vi } from 'vitest';

import { server } from './msw';

// Register jest-dom matchers on *this* package's vitest (types in ./vitest.d.ts).
// Not '@testing-library/jest-dom/vitest': under pnpm peer isolation it can augment a
// different vitest instance than the one the tests import.
expect.extend(matchers);

// jsdom has no ResizeObserver; Radix radios inside a form measure their hidden input with it.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe = () => undefined;
    unobserve = () => undefined;
    disconnect = () => undefined;
  };
}
// jsdom does not implement scrolling; a spy lets tests assert it.
Element.prototype.scrollIntoView = vi.fn();

// Listen at import time, not in beforeAll: Better Auth's client captures `fetch` when it is
// created (customFetchImpl), so MSW must have patched the global before any test module loads.
server.listen({ onUnhandledFrame: 'error' });
afterEach(() => {
  cleanup();
  vi.mocked(Element.prototype.scrollIntoView).mockClear();
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});
