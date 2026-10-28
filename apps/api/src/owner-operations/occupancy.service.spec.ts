import { DrizzleQueryError } from 'drizzle-orm';
import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { Clock } from '../common/time/clock.js';
import type { Database } from '../db/db.js';
import { OccupancyService } from './occupancy.service.js';

const SPACE = '0b6c7d1e-0000-4000-8000-0000000000aa';
const SEAT = '0b6c7d1e-0000-4000-8000-000000000001';

function deadlock(): DrizzleQueryError {
  const cause = new pg.DatabaseError('simulated', 0, 'error');
  cause.code = '40P01';
  return new DrizzleQueryError('insert ...', [], cause);
}

/** A query builder stand-in: every method returns itself and awaiting it yields `rows`. */
function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {};
  const self = new Proxy(c, {
    get(_t, prop) {
      if (prop === 'then') {
        return (ok: (v: unknown) => unknown) => Promise.resolve(rows).then(ok);
      }
      return () => self;
    },
  });
  return self;
}

describe('OccupancyService.mark', () => {
  it('retries a deadlock once, creates the marks and logs ids only', async () => {
    const spaceRow = {
      timeZone: 'Asia/Kolkata',
      openingMode: 'always_open',
      shiftChangeAt: '07:00:00',
      opensAt: null,
      closesAt: null,
    };
    let attempts = 0;
    const tx = {
      execute: vi.fn(() => Promise.resolve({ rows: [] })),
      select: vi.fn(() => chain([{ id: SEAT, label: 'A1' }])),
      insert: vi.fn(() =>
        chain([
          {
            id: 'm1',
            seatId: SEAT,
            startDate: '2030-01-07',
            endDate: null,
            note: 'secret',
          },
        ]),
      ),
    };
    const db = {
      select: vi.fn(() => chain([spaceRow])),
      transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        attempts += 1;
        if (attempts === 1) throw deadlock();
        return fn(tx);
      }),
    } as unknown as Database;
    const logger = { setContext: vi.fn(), info: vi.fn(), warn: vi.fn() };
    const clock: Clock = { now: () => new Date('2030-01-01T00:00:00Z') };
    const service = new OccupancyService(db, clock, logger as never);

    const out = await service.mark('owner-1', SPACE, {
      seatIds: [SEAT],
      startDate: '2030-01-07',
      endDate: null,
      note: 'secret',
    });

    expect(attempts).toBe(2);
    expect(out.items).toHaveLength(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('secret');
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain('secret');
  });
});
