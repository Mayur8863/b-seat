import { sql } from 'drizzle-orm';

import { space } from '../db/schema/index.js';

/** The legacy `location` for 001 responses, which promise a string; owned listings have none. */
export const legacyLocation = sql<string>`coalesce(${space.location}, '')`;
