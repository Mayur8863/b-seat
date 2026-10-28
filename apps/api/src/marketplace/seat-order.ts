import { sql, type SQL } from 'drizzle-orm';

import { seat } from '../db/schema/index.js';

/**
 * Natural order of seat labels: text prefix, then the first number as a number (M-2 before
 * M-10), then the plain label as a tie-break. The digits are cut to 9 so a long run cannot overflow.
 */
export function naturalSeatOrder(): SQL[] {
  return [
    sql`lower(regexp_replace(${seat.label}, '\\d.*$', ''))`,
    sql`substring(substring(${seat.label} from '\\d+') from 1 for 9)::int nulls first`,
    sql`lower(${seat.label})`,
    sql`${seat.label}`,
  ];
}
