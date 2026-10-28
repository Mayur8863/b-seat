import { describe, expect, it } from 'vitest';

import { offeredTimeZones } from './time-zones';

describe('offeredTimeZones', () => {
  it('is the sorted union of country zones plus UTC, without repeats', () => {
    const countries = [
      { code: 'IN', name: 'India', timeZones: ['Asia/Kolkata'] },
      { code: 'US', name: 'United States', timeZones: ['America/New_York', 'America/Chicago'] },
      { code: 'CA', name: 'Canada', timeZones: ['America/Toronto', 'America/Chicago'] },
    ];
    expect(offeredTimeZones(countries)).toEqual([
      'America/Chicago',
      'America/New_York',
      'America/Toronto',
      'Asia/Kolkata',
      'UTC',
    ]);
  });

  it('never includes ids the API refuses', () => {
    expect(offeredTimeZones([])).toEqual(['UTC']);
  });
});
