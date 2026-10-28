import { z } from 'zod';

import { LocalDate } from '../common/schemas/field-formats.js';
import { WEEKDAY_NAMES } from '../marketplace/calendar-rules.js';

const Weekday = z.enum(WEEKDAY_NAMES);

export const CalendarSchema = z
  .object({
    startDate: LocalDate,
    endDate: LocalDate.nullable().describe('Inclusive; null = no end'),
    weekdays: z.array(Weekday).min(1),
  })
  .meta({ id: 'Calendar' });
export type Calendar = z.infer<typeof CalendarSchema>;

// No minimum on startDate: the owner may start in the past (OQ-T46-4).
export const CalendarInputSchema = z
  .strictObject({
    startDate: LocalDate,
    endDate: LocalDate.nullable().describe('Inclusive; null = no end'),
    weekdays: z.array(Weekday).min(1).max(7),
  })
  .refine((c) => c.endDate === null || c.endDate >= c.startDate, {
    path: ['endDate'],
    message: 'endDate must not be before startDate',
  })
  .refine((c) => new Set(c.weekdays).size === c.weekdays.length, {
    path: ['weekdays'],
    message: 'weekdays must not repeat',
  })
  .meta({ id: 'CalendarInput' });
export type CalendarInput = z.infer<typeof CalendarInputSchema>;

export const CalendarChangeSchema = z
  .object({
    calendar: CalendarSchema.nullable().describe('null after switching a seat back to shared'),
    bookingsOutsideCalendar: z.number().int().nonnegative(),
  })
  .meta({ id: 'CalendarChange' });
export type CalendarChange = z.infer<typeof CalendarChangeSchema>;

export const SpaceCalendarsSchema = z
  .object({
    shared: CalendarSchema,
    seats: z.array(z.object({ seatId: z.uuid(), label: z.string(), calendar: CalendarSchema })),
  })
  .meta({ id: 'SpaceCalendars' });
export type SpaceCalendars = z.infer<typeof SpaceCalendarsSchema>;
