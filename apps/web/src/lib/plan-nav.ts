/** Keyboard navigation over a read-only floor plan (ui/05 8.2). Pure so it can be tested without React. */

export interface PlanSeat {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  free: boolean;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

export function readingOrder<T extends { x: number; y: number }>(seats: T[]): T[] {
  return [...seats].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The free seat nearest in `direction` from seat `fromId`; undefined at an edge. Cross-axis drift counts double. */
export function nearestFree(
  seats: PlanSeat[],
  fromId: string,
  direction: Direction,
): PlanSeat | undefined {
  const from = seats.find((s) => s.id === fromId);
  if (!from) return undefined;
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  let best: PlanSeat | undefined;
  let bestScore = Infinity;
  for (const s of seats) {
    if (!s.free || s.id === fromId) continue;
    const dx = s.x + s.w / 2 - cx;
    const dy = s.y + s.h / 2 - cy;
    const along = { right: dx, left: -dx, down: dy, up: -dy }[direction];
    if (along <= 0) continue;
    const cross = direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = along + 2 * cross;
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}
