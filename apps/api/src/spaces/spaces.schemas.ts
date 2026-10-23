import { z } from 'zod';

import { Instant, LocalDate, LocalTime, TimeZone } from '../common/schemas/field-formats.js';

// Contract: specs/001-seat-booking/contracts/spaces.md.

// ---- Requests ----

export const AvailabilityQueryInputSchema = z
  .object({
    date: LocalDate,
    startTime: LocalTime,
    endTime: LocalTime,
  })
  // HH:mm compares correctly as text. Other booking rules are not checked: any window is viewable.
  .refine((q) => q.endTime > q.startTime, {
    path: ['endTime'],
    message: 'End time must be after start time',
  })
  .meta({ id: 'AvailabilityQueryInput' });

export type AvailabilityQueryInput = z.infer<typeof AvailabilityQueryInputSchema>;

// ---- Responses ----

export const SpaceSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    location: z.string(),
    timeZone: TimeZone,
    seatCount: z.number().int().nonnegative(),
  })
  .meta({ id: 'Space', description: 'An office space people can book seats in' });

export type Space = z.infer<typeof SpaceSchema>;

export const SpaceListSchema = z
  .object({ items: z.array(SpaceSchema) })
  .meta({ id: 'SpaceList', description: 'Every space, ordered by name' });

export type SpaceList = z.infer<typeof SpaceListSchema>;

export const SeatAvailabilitySchema = z
  .object({
    id: z.uuid(),
    label: z.string(),
    features: z.array(z.string()),
    status: z
      .enum(['free', 'taken'])
      .describe('taken: at least one active booking overlaps the window'),
  })
  .meta({ id: 'SeatAvailability', description: 'A seat and whether it is free for the window' });

export type SeatAvailability = z.infer<typeof SeatAvailabilitySchema>;

export const SpaceAvailabilitySchema = z
  .object({
    space: z.object({
      id: z.uuid(),
      name: z.string(),
      location: z.string(),
      timeZone: TimeZone,
    }),
    window: z.object({
      date: LocalDate,
      startTime: LocalTime,
      endTime: LocalTime,
      startsAt: Instant,
      endsAt: Instant.describe('UTC instant (ISO 8601), exclusive'),
    }),
    seats: z.array(SeatAvailabilitySchema).describe('Ordered by label'),
  })
  .meta({
    id: 'SpaceAvailability',
    description: "Every seat in a space with its status for a window in the space's local time",
  });

export type SpaceAvailability = z.infer<typeof SpaceAvailabilitySchema>;
