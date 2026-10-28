import { ApiError } from '@bseat/api-client';
import { describe, expect, it } from 'vitest';

import { describeOwnerProblem } from './marketplace-problems';

const err = (status: number) => new ApiError(status, undefined);

describe('describeOwnerProblem', () => {
  it('uses the network copy for a non-API error', () => {
    expect(describeOwnerProblem(new TypeError('x'), 'save your space')).toEqual({
      title: "We couldn't save your space",
      description: ['Check your connection and try again.'],
    });
  });

  it.each([
    [400, 'Check the details and try again.'],
    [403, "You don't have access to this."],
    [409, 'That changed while you were working. Reload and try again.'],
    [500, 'Something went wrong on our side. Try again in a moment.'],
  ])('status %i has fixed copy', (status, text) => {
    expect(describeOwnerProblem(err(status), 'save your space').description).toEqual([text]);
  });

  it('never shows the server detail', () => {
    const e = new ApiError(500, {
      type: 'urn:bseat:problem:http-500',
      title: 'Boom',
      status: 500,
      detail: 'SECRET',
    });
    expect(JSON.stringify(describeOwnerProblem(e, 'save your space'))).not.toContain('SECRET');
  });

  it('401 links to sign-in with a safe next path', () => {
    const copy = describeOwnerProblem(err(401), 'save your space', '/owner/spaces/new');
    expect(copy.title).toBe('Your session has ended');
    expect(copy.description[0]).toEqual({
      text: 'Sign in',
      href: '/sign-in?next=%2Fowner%2Fspaces%2Fnew',
    });
  });
});
