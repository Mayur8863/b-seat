import { describe, expect, it } from 'vitest';

import { buildBookingEmails, ownerJobId, renterJobId } from './booking-emails.js';
import type { Booking } from './bookings.schemas.js';

const RENTER = { name: 'Ada Lovelace', email: 'ada@example.com' };
const OWNER = { name: 'Olive Owner', email: 'olive@example.com' };
const APP = 'http://localhost:3000/';

function booking(over: Partial<Booking> = {}): Booking {
  return {
    id: 'b-1',
    status: 'active',
    pass: 'week',
    slot: 'day',
    startDate: '2026-11-02',
    endDate: '2026-11-08',
    timeZone: 'Europe/London',
    slotTimes: { startTime: '07:00', endTime: '19:00', endsNextDay: false },
    firstStartsAt: '2026-11-02T07:00:00.000Z',
    lastEndsAt: '2026-11-08T19:00:00.000Z',
    days: [],
    skippedDates: ['2026-11-07', '2026-11-08'],
    seat: { id: 's-1', label: 'A-03', cubicleName: 'Quiet' },
    space: { id: 'sp-1', name: 'London HQ', area: 'Soho', city: 'London', country: 'GB' },
    price: { amount: '60.00', currency: 'GBP' },
    createdAt: '2026-11-01T10:00:00.000Z',
    cancelledAt: null,
    ...over,
  };
}

describe('buildBookingEmails', () => {
  it('builds the renter confirmation', () => {
    const { renter } = buildBookingEmails(booking(), RENTER, OWNER, APP);
    expect(renter.to).toBe('ada@example.com');
    expect(renter.subject).toBe('Booking confirmed: seat A-03 at London HQ from 2026-11-02');
    expect(renter.text).toContain('Hi Ada Lovelace,');
    expect(renter.text).toContain('Space:   London HQ, Soho, London');
    expect(renter.text).toContain('Seat:    A-03 (cubicle Quiet)');
    expect(renter.text).toContain('Pass:    Weekly pass, Day slot (07:00–19:00)');
    expect(renter.text).toContain(
      'Period:  Monday 2026-11-02 to Sunday 2026-11-08 (Europe/London); 5 days included; closed: 2026-11-07, 2026-11-08',
    );
    expect(renter.text).toContain('Price:   60.00 GBP');
    expect(renter.text).toContain(
      'Payment is made directly to the owner. BSeat does not take payment.',
    );
    expect(renter.text).toContain('http://localhost:3000/bookings');
  });

  it('builds the owner notification with the renter name and no renter email', () => {
    const { owner } = buildBookingEmails(booking(), RENTER, OWNER, APP);
    expect(owner.to).toBe('olive@example.com');
    expect(owner.subject).toBe('New booking at London HQ: seat A-03 from 2026-11-02');
    expect(owner.text).toContain('Ada Lovelace');
    expect(owner.text).not.toContain('ada@example.com');
    expect(owner.text).toContain('http://localhost:3000/owner/spaces/sp-1/bookings');
    expect(owner.text).toContain('Payment is made directly to the owner.');
  });

  it('strips CR and LF from the subject and omits empty cubicle and closed days', () => {
    const { renter } = buildBookingEmails(
      booking({
        skippedDates: [],
        seat: { id: 's', label: 'A\r\nBcc: x', cubicleName: null },
        space: { id: 'sp', name: 'Hub\nEvil', area: 'a', city: 'c', country: 'GB' },
      }),
      RENTER,
      OWNER,
      APP,
    );
    expect(renter.subject).not.toMatch(/[\r\n]/);
    expect(renter.text).not.toContain('closed:');
  });

  it('renders a multi-line, bidi-laden user name on one line, capped', () => {
    const name = `Eve\nBcc: x@evil.test\r\n\u202Eevil${'z'.repeat(200)}`;
    const { owner, renter } = buildBookingEmails(booking(), { ...RENTER, name }, OWNER, APP);
    const greeting = renter.text.split('\n')[0] ?? '';
    const line = owner.text.split('\n')[0] ?? '';
    for (const l of [greeting, line, owner.text.split('\n')[2] ?? '']) {
      expect(l).not.toMatch(/[\u202E\r]/);
    }
    expect(greeting).toMatch(/^Hi Eve Bcc: x@evil\.test evil/);
    expect(owner.text.split('\n')[2]).toMatch(/^Eve Bcc: x@evil\.test evil/);
    expect((owner.text.split('\n')[2] ?? '').length).toBeLessThan(160);
  });

  it('shows a night slot across the DST change in the slot wall-clock', () => {
    const { renter } = buildBookingEmails(
      booking({
        pass: 'day',
        slot: 'night',
        startDate: '2026-10-24',
        endDate: '2026-10-24',
        slotTimes: { startTime: '19:00', endTime: '07:00', endsNextDay: true },
        skippedDates: [],
      }),
      RENTER,
      OWNER,
      APP,
    );
    expect(renter.text).toContain('Pass:    Day pass, Night slot (19:00–07:00 next day)');
    expect(renter.text).toContain('1 days included');
  });

  it('uses stable job ids', () => {
    expect(renterJobId('x')).toBe('booking-confirmed-x');
    expect(ownerJobId('x')).toBe('booking-owner-notified-x');
  });
});
