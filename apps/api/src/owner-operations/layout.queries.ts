import { inArray } from 'drizzle-orm';

import type { Database } from '../db/db.js';
import { layoutElement } from '../db/schema/index.js';

/**
 * Spaces among `spaceIds` whose plan has at least one element. A saved empty plan does not
 * count (OQ-T61-4): renters would see a blank canvas.
 */
export async function spacesWithLayout(db: Database, spaceIds: string[]): Promise<Set<string>> {
  if (spaceIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ spaceId: layoutElement.spaceId })
    .from(layoutElement)
    .where(inArray(layoutElement.spaceId, spaceIds));
  return new Set(rows.map((r) => r.spaceId));
}
