import { BadRequestException, StandardSchemaValidationPipe } from '@nestjs/common';
import type { StandardSchemaV1 } from '@standard-schema/spec';

export interface FieldError {
  path: string;
  message: string;
}

export class RequestValidationException extends BadRequestException {
  constructor(readonly errors: FieldError[]) {
    super('Request validation failed');
  }
}

function issuePath(issue: StandardSchemaV1.Issue): string {
  return (issue.path ?? [])
    .map((segment) => (typeof segment === 'object' ? segment.key : segment))
    .map(String)
    .join('.');
}

// A huge invalid body must not become a huge response.
const MAX_REPORTED_ISSUES = 20;

/** Global pipe: validates `@Body/@Query/@Param({ schema })` with Zod (Standard Schema). */
export const validationPipe = new StandardSchemaValidationPipe({
  exceptionFactory: (issues) =>
    new RequestValidationException(
      issues
        .slice(0, MAX_REPORTED_ISSUES)
        .map((issue) => ({ path: issuePath(issue), message: issue.message })),
    ),
});
