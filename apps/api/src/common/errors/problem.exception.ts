import { HttpException } from '@nestjs/common';

import type { ProblemExtensions } from './problem-types.js';

export type { ProblemExtensions };

/**
 * A domain failure with its own RFC 9457 problem `type` (e.g.
 * `urn:bseat:problem:booking:seat-unavailable`). `ProblemFilter` uses `type`, `title` and
 * `detail` as given; built-in Nest exceptions keep the generic `http-<status>` type.
 * Pass type constants from the owning module, never inline literals (ADR-0008 section 3).
 */
export class ProblemException extends HttpException {
  constructor(
    status: number,
    readonly type: string,
    readonly title: string,
    readonly detail: string,
    /**
     * Extra members for the body. Typed to the documented extension shapes, so build them
     * with the factories in `problem-types.ts`; the filter also drops reserved keys.
     */
    readonly extensions?: ProblemExtensions,
    /** Response headers, e.g. `Retry-After` on a temporary 503. */
    readonly headers?: Readonly<Record<string, string>>,
  ) {
    super(detail, status);
  }
}
