import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

import type { Problem } from './problem.js';
import { RequestValidationException } from './validation.js';

/** Maps every thrown error to an RFC 9457 `application/problem+json` response. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ProblemFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const problem = this.toProblem(exception, req);

    if (problem.status >= 500) {
      this.logger.error({ err: exception }, 'unhandled error');
    }

    res.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown, req: Request): Problem {
    const requestId = typeof req.id === 'string' ? req.id : undefined;
    const base = { instance: req.originalUrl, ...(requestId && { requestId }) };

    if (exception instanceof RequestValidationException) {
      return {
        ...base,
        type: 'urn:bseat:problem:validation',
        title: 'Request validation failed',
        status: HttpStatus.BAD_REQUEST,
        errors: exception.errors,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        ...base,
        type: `urn:bseat:problem:http-${status}`,
        title: HttpStatus[status]?.replaceAll('_', ' ').toLowerCase() ?? 'error',
        status,
        detail: exception.message,
      };
    }

    // Never leak internals for unexpected errors.
    return {
      ...base,
      type: 'urn:bseat:problem:internal',
      title: 'internal server error',
      status: HttpStatus.INTERNAL_SERVER_ERROR,
    };
  }
}
