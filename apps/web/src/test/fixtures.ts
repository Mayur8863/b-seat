import type { SpaceAvailability, SpaceList } from '@bseat/api-client';

export const LONDON_ID = '11111111-1111-4111-8111-111111111111';
export const PARIS_ID = '22222222-2222-4222-8222-222222222222';

export const twoSpaces: SpaceList = {
  items: [
    {
      id: LONDON_ID,
      name: 'London HQ',
      location: 'London, United Kingdom',
      timeZone: 'Europe/London',
      seatCount: 6,
    },
    {
      id: PARIS_ID,
      name: 'Paris Hub',
      location: 'Paris, France',
      timeZone: 'Europe/Paris',
      seatCount: 1,
    },
  ],
};

/** Six seats, A-01 taken. */
export const londonAvailability: SpaceAvailability = {
  space: {
    id: LONDON_ID,
    name: 'London HQ',
    location: 'London, United Kingdom',
    timeZone: 'Europe/London',
  },
  window: {
    date: '2026-10-23',
    startTime: '09:00',
    endTime: '17:00',
    startsAt: '2026-10-23T08:00:00.000Z',
    endsAt: '2026-10-23T16:00:00.000Z',
  },
  seats: ['A-01', 'A-02', 'A-03', 'A-04', 'A-05', 'A-06'].map((label, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i + 1}`,
    label,
    features: i === 1 ? ['standing desk', 'dual monitor'] : [],
    status: i === 0 ? ('taken' as const) : ('free' as const),
  })),
};

export function problemResponse(status: number, type: string, detail?: string) {
  return new Response(
    JSON.stringify({ type: `urn:bseat:problem:${type}`, title: type, status, detail }),
    { status, headers: { 'content-type': 'application/problem+json' } },
  );
}
