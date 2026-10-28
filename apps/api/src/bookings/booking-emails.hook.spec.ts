import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../db/db.js';
import type { MailService } from '../mail/mail.service.js';
import type { BookingCreatedEvent } from './booking-created.hook.js';
import { MailBookingCreatedHook } from './booking-emails.hook.js';
import type { Booking } from './bookings.schemas.js';

const booking = {
  id: 'b-1',
  status: 'active',
  pass: 'day',
  slot: 'day',
  startDate: '2026-11-03',
  endDate: '2026-11-03',
  timeZone: 'Europe/London',
  slotTimes: { startTime: '07:00', endTime: '19:00', endsNextDay: false },
  firstStartsAt: '2026-11-03T07:00:00.000Z',
  lastEndsAt: '2026-11-03T19:00:00.000Z',
  days: [],
  skippedDates: [],
  seat: { id: 's-1', label: 'A1', cubicleName: null },
  space: { id: 'sp-1', name: 'Hub', area: 'a', city: 'c', country: 'GB' },
  price: { amount: '10.00', currency: 'GBP' },
  createdAt: '2026-11-02T10:00:00.000Z',
  cancelledAt: null,
} satisfies Booking;
const event: BookingCreatedEvent = {
  bookingId: 'b-1',
  seatId: 's-1',
  spaceId: 'sp-1',
  userId: 'u-renter',
  booking,
};

function setup(send: ReturnType<typeof vi.fn>) {
  // Two reads: the renter, then the space owner.
  const rows = [[{ name: 'Ada', email: 'ada@x.test' }], [{ name: 'Olive', email: 'olive@x.test' }]];
  const where = vi.fn(() => Promise.resolve(rows.shift() ?? []));
  const db = { select: () => ({ from: () => ({ where, innerJoin: () => ({ where }) }) }) };
  const logger = { setContext: vi.fn(), error: vi.fn() };
  const config = { get: () => 'http://localhost:3000' };
  const hook = new MailBookingCreatedHook(
    db as unknown as Database,
    { send } as unknown as MailService,
    logger as never,
    config as never,
  );
  return { hook, logger };
}

describe('MailBookingCreatedHook', () => {
  it('enqueues the renter and owner emails with idempotent job ids', async () => {
    const send = vi.fn(() => Promise.resolve());
    const { hook } = setup(send);
    await hook.onCreated(event);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'ada@x.test' }), {
      jobId: 'booking-confirmed-b-1',
    });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'olive@x.test' }), {
      jobId: 'booking-owner-notified-b-1',
    });
  });

  it('bounds each enqueue and logs both failures with the booking id only', async () => {
    vi.useFakeTimers();
    try {
      const send = vi
        .fn()
        .mockRejectedValueOnce(new Error('redis down ada@x.test'))
        .mockReturnValueOnce(new Promise(() => undefined));
      const { hook, logger } = setup(send);
      const done = hook.onCreated(event);
      await vi.advanceTimersByTimeAsync(2000);
      await done;
      expect(logger.error).toHaveBeenCalledTimes(2);
      for (const call of logger.error.mock.calls) {
        expect(call[0]).toEqual({ bookingId: 'b-1', recipient: expect.any(String) });
        expect(JSON.stringify(call)).not.toContain('x.test');
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
