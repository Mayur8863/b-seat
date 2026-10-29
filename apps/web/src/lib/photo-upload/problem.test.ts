import { ApiError } from '@bseat/api-client';
import { describe, expect, it } from 'vitest';

import { uploadProblem } from './problem';

const err = (status: number, type?: string) =>
  new ApiError(status, type ? { type, status } : undefined);

describe('uploadProblem', () => {
  it.each([
    [err(413, 'urn:bseat:problem:photo:too-large'), 'photo:too-large'],
    [err(503, 'urn:bseat:problem:photo:busy'), 'photo:busy'],
    [err(0, 'urn:bseat:problem:network'), 'network'],
    [err(408, 'urn:bseat:problem:network'), 'network'],
    [err(401, 'urn:bseat:problem:unauthorized'), 'http-401'],
    [err(404, 'urn:bseat:problem:not-found'), 'http-404'],
    [err(400, 'urn:bseat:problem:validation'), 'validation'],
    [err(500), 'unknown'],
    [new Error('x'), 'network'],
  ])('maps %#', (e, expected) => {
    expect(uploadProblem(e)).toBe(expected);
  });
});
