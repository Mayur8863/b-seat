import { type ArgumentsHost, ForbiddenException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { ProblemFilter } from './problem.filter.js';
import { RequestValidationException, validationPipe } from './validation.js';

function run(exception: unknown, reqId: unknown = 'req-1') {
  const logger = { setContext: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
  const res = { status: vi.fn(), type: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: '/x', id: reqId }),
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;

  new ProblemFilter(logger).catch(exception, host);
  return { body: res.json.mock.calls[0]?.[0], res, logger };
}

describe('ProblemFilter', () => {
  it('maps validation errors to 400 with field errors', () => {
    const { body, res } = run(new RequestValidationException([{ path: 'a', message: 'bad' }]));
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    expect(body).toMatchObject({
      type: 'urn:bseat:problem:validation',
      errors: [{ path: 'a', message: 'bad' }],
      requestId: 'req-1',
      instance: '/x',
    });
  });

  it('maps HttpExceptions to their status', () => {
    const { body } = run(new ForbiddenException('nope'));
    expect(body).toMatchObject({ status: 403, title: 'forbidden', detail: 'nope' });
  });

  it('hides internals of unexpected errors and logs them', () => {
    const { body, logger } = run(new Error('db password is hunter2'), 42);
    expect(body).toEqual({
      type: 'urn:bseat:problem:internal',
      title: 'internal server error',
      status: 500,
      instance: '/x',
    });
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('validationPipe', () => {
  it('turns Standard Schema issues into field errors with dotted paths', () => {
    const factory = (
      validationPipe as unknown as {
        exceptionFactory: (i: unknown[]) => RequestValidationException;
      }
    ).exceptionFactory;
    const err = factory([
      { message: 'Required', path: ['seat', { key: 'id' }] },
      { message: 'Bad', path: undefined },
    ]);
    expect(err.errors).toEqual([
      { path: 'seat.id', message: 'Required' },
      { path: '', message: 'Bad' },
    ]);
  });
});
