import { ApiError } from '@bseat/api-client';
import { describe, expect, it } from 'vitest';

import { describeLayoutProblem } from './problems';

const err = (status: number, type?: string) =>
  new ApiError(
    status,
    type ? { type: `urn:bseat:problem:layout:${type}`, title: 't', status } : undefined,
  );

describe('describeLayoutProblem', () => {
  it('maps a stale version to the reload state', () => {
    expect(describeLayoutProblem(err(409, 'stale-version'))).toEqual({
      title: 'This layout changed',
      description:
        'It was saved from somewhere else after you opened it. Reload the layout to continue. Your unsaved positions will be lost.',
      reload: true,
    });
  });
  it('maps out-of-bounds', () => {
    expect(describeLayoutProblem(err(422, 'out-of-bounds'))).toMatchObject({
      title: 'Items are outside the grid',
      description: 'Keep every item inside the grid, and every seat inside its cubicle.',
      revalidate: true,
    });
  });
  it('maps a missing seat or cubicle (404) to reload', () => {
    expect(describeLayoutProblem(err(404))).toMatchObject({
      title: "We couldn't find a seat or cubicle",
      reload: true,
    });
  });
  it('maps validation and the status fallbacks', () => {
    expect(describeLayoutProblem(err(400)).description).toBe('Check the details and try again.');
    expect(describeLayoutProblem(err(403)).description).toBe("You don't have access to this.");
    expect(describeLayoutProblem(err(500)).description).toBe(
      'Something went wrong on our side. Try again in a moment.',
    );
    expect(describeLayoutProblem(err(401)).description).toBe('Sign in again to continue.');
    expect(describeLayoutProblem(new Error('offline'))).toMatchObject({
      title: "We couldn't save the layout",
      description: 'Check your connection and try again.',
    });
  });
});
