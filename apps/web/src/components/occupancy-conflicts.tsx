import type { OccupancyConflict } from '@bseat/api-client';

import { foldDates, formatMarkRange, formatRanges } from '@/lib/occupancy-values';

const MAX_SEATS = 10;
const MAX_RANGES = 6;

/** Per-seat reasons a mark was refused (ui/04 2.4). Plain text only, no renter identity. */
export function OccupancyConflicts({
  conflicts,
  now,
}: {
  conflicts: OccupancyConflict[];
  now?: Date;
}) {
  const shown = conflicts.slice(0, MAX_SEATS);
  const moreSeats = conflicts.length - shown.length;
  return (
    <ul className="mt-3 grid gap-2 text-sm" aria-label="Seats in the way">
      {shown.map((c) => {
        const ranges = foldDates(c.bookedDates);
        const hiddenDays = ranges
          .slice(MAX_RANGES)
          .reduce((n, [a, b]) => n + (Date.parse(b) - Date.parse(a)) / 86_400_000 + 1, 0);
        return (
          <li key={c.seatId} className="grid gap-0.5">
            <span className="font-medium">{c.label}</span>
            {ranges.length > 0 && (
              <span>
                Booked: {formatRanges(ranges.slice(0, MAX_RANGES), now)}
                {hiddenDays > 0 && ` and ${hiddenDays} more days`}
              </span>
            )}
            {c.marks.map((m) => (
              <span key={m.id}>
                Already occupied: {formatMarkRange(m.startDate, m.endDate, now)}
              </span>
            ))}
          </li>
        );
      })}
      {moreSeats > 0 && <li>and {moreSeats} more seats</li>}
    </ul>
  );
}
