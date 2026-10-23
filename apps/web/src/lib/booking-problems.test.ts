import { ApiError, type ProblemDetails } from '@bseat/api-client';
import { describe, expect, it } from 'vitest';

import { describeProblem } from './booking-problems';

const problem = (status: number, type: string, detail?: string) =>
  new ApiError(status, { type: `urn:bseat:problem:${type}`, title: 't', status, detail });

describe('describeProblem', () => {
  it('maps typed rule problems with the time zone', () => {
    const copy = describeProblem(problem(422, 'booking-rule:invalid-local-time'), 'availability', {
      timeZone: 'Europe/London',
    });
    expect(copy.title).toBe("That time doesn't exist in Europe/London");
  });

  it('maps seat conflicts using the seat label', () => {
    const copy = describeProblem(problem(409, 'booking:seat-unavailable'), 'book', {
      seat: 'A-03',
    });
    expect(copy.description[0]).toContain('A-03');
  });

  it('links to My bookings on overlap', () => {
    const copy = describeProblem(problem(409, 'booking:user-overlap'), 'book');
    expect(copy.description).toContainEqual({ text: 'My bookings', href: '/bookings' });
  });

  it('maps 404 by action', () => {
    expect(describeProblem(problem(404, 'http-404'), 'availability').title).toBe(
      'Office space not found',
    );
    expect(describeProblem(problem(404, 'http-404'), 'book').title).toBe('Seat not found');
    expect(describeProblem(problem(404, 'http-404'), 'cancel').title).toBe('Booking not found');
  });

  it('links to sign-in with the current path on 401', () => {
    const copy = describeProblem(problem(401, 'http-401'), 'book', { path: '/book' });
    expect(copy.title).toBe('Your session has ended');
    expect(copy.description[0]).toEqual({ text: 'Sign in', href: '/sign-in?next=%2Fbook' });
  });

  it('maps validation problems', () => {
    expect(describeProblem(problem(400, 'validation'), 'availability').title).toBe(
      'Check the details',
    );
  });

  it('shows detail for other 4xx and a generic line for 5xx', () => {
    expect(describeProblem(problem(418, 'teapot', 'Short and stout'), 'book').description).toEqual([
      'Short and stout',
    ]);
    expect(describeProblem(problem(500, 'http-500', 'secret'), 'book').description[0]).toContain(
      'Try again in a moment',
    );
  });

  it('handles network failures', () => {
    expect(describeProblem(new TypeError('Failed to fetch'), 'book').title).toBe(
      "We couldn't reach BSeat",
    );
  });

  it.each([
    ['booking:already-started', 'cancel', 'This booking has already started'],
    ['booking-rule:end-before-start', 'book', 'End time is before start time'],
    ['booking-rule:not-on-quarter-hour', 'book', 'Use 15-minute steps'],
    ['booking-rule:too-short', 'book', 'Booking too short'],
    ['booking-rule:too-long', 'book', 'Booking too long'],
    ['booking-rule:outside-working-hours', 'book', 'Outside working hours'],
    ['booking-rule:starts-in-past', 'book', 'That time has passed'],
    ['booking-rule:too-far-ahead', 'book', 'Too far ahead'],
  ] as const)('maps %s to its ui.md title', (type, action, title) => {
    expect(
      describeProblem(problem(type.startsWith('booking:') ? 409 : 422, type), action).title,
    ).toBe(title);
  });

  it('names the time zone in the working-hours copy', () => {
    const copy = describeProblem(problem(422, 'booking-rule:outside-working-hours'), 'book', {
      timeZone: 'Europe/Paris',
    });
    expect(copy.description[0]).toContain('(Europe/Paris)');
  });

  it('applies fallbackTitle only to generic outcomes', () => {
    const context = { fallbackTitle: "We couldn't load seats" };
    expect(describeProblem(problem(500, 'http-500'), 'availability', context).title).toBe(
      "We couldn't load seats",
    );
    expect(
      describeProblem(problem(418, 'teapot', 'Short and stout'), 'availability', context).title,
    ).toBe("We couldn't load seats");
    expect(describeProblem(new TypeError('Failed to fetch'), 'availability', context).title).toBe(
      "We couldn't load seats",
    );
    expect(describeProblem(problem(404, 'http-404'), 'availability', context).title).toBe(
      'Office space not found',
    );
    expect(describeProblem(problem(401, 'http-401'), 'availability', context).title).toBe(
      'Your session has ended',
    );
    expect(
      describeProblem(problem(422, 'booking-rule:too-short'), 'availability', context).title,
    ).toBe('Booking too short');
  });

  it('only puts a relative path in the sign-in next parameter', () => {
    const href = (path: string) =>
      describeProblem(problem(401, 'http-401'), 'book', { path }).description[0];
    expect(href('/book?x=1')).toEqual({ text: 'Sign in', href: '/sign-in?next=%2Fbook%3Fx%3D1' });
    expect(href('//evil.example')).toEqual({ text: 'Sign in', href: '/sign-in' });
    expect(href('https://evil.example')).toEqual({ text: 'Sign in', href: '/sign-in' });
  });

  it('shows generic copy when the error body is not problem details', () => {
    const html = new ApiError(502, '<html>Bad Gateway</html>' as unknown as ProblemDetails);
    expect(describeProblem(html, 'book').description).toEqual([
      "We couldn't complete that. Try again in a moment.",
    ]);
    const noType = new ApiError(413, { title: 'x' } as unknown as ProblemDetails);
    expect(describeProblem(noType, 'book').title).toBe('Something went wrong');
  });

  it('does not put unsafe paths in the sign-in link', () => {
    const copy = describeProblem(new ApiError(401, undefined), 'book', { path: '/\\evil.example' });
    expect(copy.description[0]).toEqual({ text: 'Sign in', href: '/sign-in' });
  });
});
