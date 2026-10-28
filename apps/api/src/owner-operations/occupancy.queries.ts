import { sql } from 'drizzle-orm';

import type { Database } from '../db/db.js';

export interface SeatToday {
  state: 'vacant' | 'occupied' | 'booked';
  note: string | null;
  markId: string | null;
}

const VACANT: SeatToday = { state: 'vacant', note: null, markId: null };

/** What holds each seat right now (AC 5.4); the note is only ever returned to the owner. */
export async function seatsToday(
  db: Database,
  seatIds: readonly string[],
  now: Date,
): Promise<Map<string, SeatToday>> {
  const out = new Map<string, SeatToday>(seatIds.map((id) => [id, VACANT]));
  if (seatIds.length === 0) return out;
  const { rows } = await db.execute<{
    seat_id: string;
    mark_id: string | null;
    note: string | null;
  }>(sql`
    SELECT h.seat_id, h.occupancy_mark_id AS mark_id, m.note
    FROM seat_hold h
    LEFT JOIN occupancy_mark m ON m.id = h.occupancy_mark_id
    WHERE h.seat_id = ANY(${sql.param(seatIds)}::uuid[])
      AND h.active
      AND tstzrange(h.starts_at, h.ends_at, '[)') @> ${now.toISOString()}::timestamptz
  `);
  for (const r of rows) {
    // Holds of one seat never overlap, so at most one row per seat.
    out.set(
      r.seat_id,
      r.mark_id === null
        ? { state: 'booked', note: null, markId: null }
        : { state: 'occupied', note: r.note, markId: r.mark_id },
    );
  }
  return out;
}
