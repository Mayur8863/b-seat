import { describe, expect, it } from 'vitest';

import { buildBookingConfirmation, confirmationJobId } from './booking-confirmation.mail.js';
import type { Booking } from './bookings.schemas.js';

const USER = { name: 'Ada Lovelace', email: 'ada@example.com' };
const APP_URL = 'http://localhost:3000';

function londonBooking(startsAt: string, endsAt: string): Booking {
  return {
    id: '0b6c7d1e-0000-4000-8000-000000000003',
    status: 'active',
    // Deliberately wrong local fields: the email must derive local times from the instants.
    date: '1999-01-01',
    startTime: '00:00',
    endTime: '00:15',
    timeZone: 'Europe/London',
    startsAt,
    endsAt,
    seat: { id: '0b6c7d1e-0000-4000-8000-000000000001', label: 'A-03' },
    space: {
      id: '0b6c7d1e-0000-4000-8000-000000000002',
      name: 'London HQ',
      location: 'London, United Kingdom',
    },
    createdAt: '2026-01-01T10:00:00.000Z',
    cancelledAt: null,
  };
}

describe('buildBookingConfirmation (contracts/booking-email.md)', () => {
  it('renders a winter (GMT) booking in London wall-clock time', () => {
    const job = buildBookingConfirmation(
      londonBooking('2026-01-15T09:00:00.000Z', '2026-01-15T12:00:00.000Z'),
      USER,
      APP_URL,
    );

    expect(job.to).toBe('ada@example.com');
    expect(job.subject).toBe('Seat A-03 booked at London HQ on 2026-01-15');
    expect(job.text).toBe(
      [
        'Hi Ada Lovelace,',
        '',
        'Your seat is booked.',
        '',
        'Space:  London HQ (London, United Kingdom)',
        'Seat:   A-03',
        'When:   Thursday 2026-01-15, 09:00–12:00 (Europe/London)',
        '',
        'You can see or cancel your bookings at http://localhost:3000/bookings.',
        '',
        'BSeat',
        '',
      ].join('\n'),
    );
    expect(job.html).toBeUndefined();
  });

  it('renders a summer (BST) booking in London wall-clock time (edge "time zones")', () => {
    const job = buildBookingConfirmation(
      londonBooking('2026-07-15T08:00:00.000Z', '2026-07-15T11:00:00.000Z'),
      USER,
      APP_URL,
    );

    expect(job.subject).toBe('Seat A-03 booked at London HQ on 2026-07-15');
    expect(job.text).toContain('When:   Wednesday 2026-07-15, 09:00–12:00 (Europe/London)');
  });

  it('uses the local date of the space, not the UTC date', () => {
    const kolkata = {
      ...londonBooking('2026-10-22T20:00:00.000Z', '2026-10-22T21:00:00.000Z'),
      timeZone: 'Asia/Kolkata',
    };

    const job = buildBookingConfirmation(kolkata, USER, APP_URL);

    expect(job.subject).toBe('Seat A-03 booked at London HQ on 2026-10-23');
    expect(job.text).toContain('Friday 2026-10-23, 01:30–02:30 (Asia/Kolkata)');
  });

  it('links to the bookings page without a double slash', () => {
    const job = buildBookingConfirmation(
      londonBooking('2026-01-15T09:00:00.000Z', '2026-01-15T12:00:00.000Z'),
      USER,
      'https://bseat.example.com/',
    );

    expect(job.text).toContain('at https://bseat.example.com/bookings.');
  });
});

describe('confirmationJobId', () => {
  it('is booking-confirmed-<id> without a colon (BullMQ rejects one)', () => {
    expect(confirmationJobId('abc')).toBe('booking-confirmed-abc');
  });
});
