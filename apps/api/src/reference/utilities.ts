/**
 * The standard utilities an owner can tick on a listing (OQ-8). This is the single source:
 * the DB CHECK `space_utilities_max` (src/db/schema/space.ts) caps the array at this length,
 * so adding an item here needs a migration that raises the cap.
 */
export const STANDARD_UTILITIES = [
  'wifi',
  'air_conditioning',
  'power_backup',
  'parking',
  'meeting_room',
  'tea_coffee',
  'printer',
  'lockers',
  'security_24h',
  'cafeteria',
  'accessible_entrance',
] as const;

export type StandardUtility = (typeof STANDARD_UTILITIES)[number];

export const MAX_STANDARD_UTILITIES = STANDARD_UTILITIES.length;
