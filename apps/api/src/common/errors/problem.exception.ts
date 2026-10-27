import { HttpException } from '@nestjs/common';

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
    /** Extra members for the body; the filter never lets them override standard ones. */
    readonly extensions?: Readonly<Record<string, unknown>>,
  ) {
    super(detail, status);
  }
}
