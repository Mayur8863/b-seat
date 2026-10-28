import { z } from 'zod';

/** One definition of the pass and slot enums; no `.meta` id, so each use inlines in OpenAPI. */
export const PassTypeEnum = z.enum(['day', 'week', 'month']);
export const SlotKindEnum = z.enum(['day', 'night', 'full_day', 'working_hours']);
