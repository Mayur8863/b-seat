import {
  type ArgumentsHost,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import { ProblemException } from './problem.exception.js';
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

  it('uses the type, title and detail of a ProblemException', () => {
    const { body, res, logger } = run(
      new ProblemException(
        409,
        'urn:bseat:problem:booking:seat-unavailable',
        'Seat unavailable',
        'This seat is no longer available for that time.',
      ),
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    expect(body).toEqual({
      type: 'urn:bseat:problem:booking:seat-unavailable',
      title: 'Seat unavailable',
      status: 409,
      detail: 'This seat is no longer available for that time.',
      instance: '/x',
      requestId: 'req-1',
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('keeps the generic mapping for built-in Nest exceptions (regression)', () => {
    const { body } = run(new NotFoundException('Seat not found'));
    expect(body).toEqual({
      type: 'urn:bseat:problem:http-404',
      title: 'not found',
      status: 404,
      detail: 'Seat not found',
      instance: '/x',
      requestId: 'req-1',
    });
  });

  it('logs a 5xx ProblemException like any server error', () => {
    const { body, logger } = run(
      new ProblemException(503, 'urn:bseat:problem:test-unavailable', 'Unavailable', 'Try later.'),
    );
    expect(body).toMatchObject({ status: 503, type: 'urn:bseat:problem:test-unavailable' });
    expect(logger.error).toHaveBeenCalled();
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

describe('ProblemFilter extensions', () => {
  it('adds the extension members to the body', () => {
    const { body } = run(
      new ProblemException(409, 'urn:bseat:problem:listing:label-taken', 'Label taken', 'Taken.', {
        labels: ['A-1'],
      }),
    );
    expect(body).toMatchObject({ labels: ['A-1'], status: 409, detail: 'Taken.' });
  });

  it('never lets an extension override a standard member', () => {
    const { body, res } = run(
      new ProblemException(409, 'urn:bseat:problem:listing:label-taken', 'Label taken', 'Taken.', {
        labels: ['A-1'],
        type: 'x',
        title: 'x',
        status: 200,
        detail: 'x',
        instance: 'x',
        requestId: 'x',
      }),
    );
    expect(res.status).toHaveBeenCalledWith(409);
    expect(body).toEqual({
      labels: ['A-1'],
      type: 'urn:bseat:problem:listing:label-taken',
      title: 'Label taken',
      status: 409,
      detail: 'Taken.',
      instance: '/x',
      requestId: 'req-1',
    });
  });
});

describe('ProblemException', () => {
  it('is an HttpException with the status, and the detail as its message', () => {
    const err = new ProblemException(
      422,
      'urn:bseat:problem:booking-rule:too-long',
      'Invalid booking window',
      'Too long.',
    );
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(422);
    expect(err.message).toBe('Too long.');
    expect(err).toMatchObject({
      type: 'urn:bseat:problem:booking-rule:too-long',
      title: 'Invalid booking window',
      detail: 'Too long.',
    });
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
