import { z } from 'zod';

import { Instant, LocalDate } from '../common/schemas/field-formats.js';

export const MAX_MARK_SEATS = 200;

export const MarkOccupiedInputSchema = z
  .strictObject({
    seatIds: z.array(z.uuid()).min(1).max(MAX_MARK_SEATS),
    startDate: LocalDate,
    endDate: LocalDate.nullable().describe(
      'Inclusive; null keeps the seats occupied until vacated',
    ),
    note: z.string().trim().max(200).nullable(),
  })
  .refine((v) => v.endDate === null || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'endDate must not be before startDate',
  })
  .meta({ id: 'MarkOccupiedInput' });
export type MarkOccupiedInput = z.infer<typeof MarkOccupiedInputSchema>;

export const ListOccupancyInputSchema = z
  .strictObject({ seatId: z.uuid().optional() })
  .meta({ id: 'ListOccupancyInput' });
export type ListOccupancyInput = z.infer<typeof ListOccupancyInputSchema>;

export const OccupancyMarkSchema = z
  .object({
    id: z.uuid(),
    seat: z.object({ id: z.uuid(), label: z.string() }),
    startDate: LocalDate,
    endDate: LocalDate.nullable(),
    note: z.string().nullable(),
    startsAt: Instant,
    endsAt: Instant.nullable(),
    status: z.enum(['active', 'ended']),
  })
  .meta({ id: 'OccupancyMark' });
export type OccupancyMark = z.infer<typeof OccupancyMarkSchema>;

export const OccupancyMarkListSchema = z
  .object({ items: z.array(OccupancyMarkSchema) })
  .meta({ id: 'OccupancyMarkList' });
export type OccupancyMarkList = z.infer<typeof OccupancyMarkListSchema>;
