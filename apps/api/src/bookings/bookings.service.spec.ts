import { DrizzleQueryError } from 'drizzle-orm';
import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import type { Clock } from '../common/time/clock.js';
import type { Database } from '../db/db.js';
import type { BookingCreatedHook } from './booking-created.hook.js';
import { BookingsService } from './bookings.service.js';
import type { PassBookingFacts } from './pass-booking-plan.js';

const facts: PassBookingFacts = {
  space: {
    id: 'space-1',
    name: 'Hub',
    area: 'Baner',
    city: 'Pune',
    country: 'IN',
    currency: 'INR',
    status: 'published',
    ownerId: 'owner-1',
    timeZone: 'Europe/London',
    openingHours: { mode: 'always_open', shiftChangeAt: '07:00' },
  },
  seat: { id: 'seat-1', label: 'A1', cubicleName: null },
  slotEnabled: true,
  price: '10.00',
  calendar: { startDate: '2026-01-01', endDate: null, weekdays: 127 },
};
const input = { seatId: 'seat-1', pass: 'day', slot: 'day', startDate: '2026-11-03' } as const;

function deadlock(): DrizzleQueryError {
  const cause = new pg.DatabaseError('simulated', 0, 'error');
  cause.code = '40P01';
  return new DrizzleQueryError('insert', [], cause);
}

function setup(transaction: ReturnType<typeof vi.fn>) {
  const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() };
  const hook: BookingCreatedHook = { onCreated: vi.fn(() => Promise.resolve()) };
  const clock: Clock = { now: () => new Date('2026-11-02T10:00:00Z') };
  const service = new BookingsService(
    { transaction } as unknown as Database,
    clock,
    logger as never,
    hook,
  );
  vi.spyOn(service, 'loadFacts').mockResolvedValue(facts);
  return { service, logger, hook };
}

describe('BookingsService.create', () => {
  it('retries once on a deadlock and logs one warn without user data', async () => {
    const transaction = vi
      .fn()
      .mockRejectedValueOnce(deadlock())
      .mockResolvedValueOnce({ id: 'b-1', createdAt: new Date('2026-11-02T10:00:00Z') });
    const { service, logger, hook } = setup(transaction);

    const booking = await service.create('renter-secret', 'space-1', input);

    expect(booking.id).toBe('b-1');
    expect(booking.days).toHaveLength(1);
    expect(transaction).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { seatId: 'seat-1', attempt: 1 },
      'booking.insert_deadlock_retry',
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('renter-secret');
    expect(hook.onCreated).toHaveBeenCalledTimes(1);
  });

  it('gives up after 3 deadlocks and does not notify', async () => {
    const transaction = vi.fn().mockRejectedValue(deadlock());
    const { service, hook } = setup(transaction);
    await expect(service.create('renter', 'space-1', input)).rejects.toBeInstanceOf(
      DrizzleQueryError,
    );
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(hook.onCreated).not.toHaveBeenCalled();
  });

  it('logs booking.lock_timeout (ids only) on 55P03 and does not retry', async () => {
    const cause = new pg.DatabaseError('simulated', 0, 'error');
    cause.code = '55P03';
    const transaction = vi.fn().mockRejectedValue(new DrizzleQueryError('x', [], cause));
    const { service, logger } = setup(transaction);
    await expect(service.create('renter', 'space-1', input)).rejects.toBeInstanceOf(
      DrizzleQueryError,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      { seatId: 'seat-1', spaceId: 'space-1' },
      'booking.lock_timeout',
    );
  });

  it('the response has no user id and the hook failing does not fail the booking', async () => {
    const transaction = vi.fn().mockResolvedValue({ id: 'b-2', createdAt: new Date() });
    const { service, hook } = setup(transaction);
    vi.mocked(hook.onCreated).mockRejectedValue(new Error('redis down'));
    const booking = await service.create('renter', 'space-1', input);
    expect(JSON.stringify(booking)).not.toContain('renter');
    expect(booking.price).toEqual({ amount: '10.00', currency: 'INR' });
    expect(booking.status).toBe('active');
  });
});
