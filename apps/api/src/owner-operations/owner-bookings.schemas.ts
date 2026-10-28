import { z } from 'zod';

import { CurrencyCode, Instant, LocalDate, TimeZone } from '../common/schemas/field-formats.js';

export interface BookingCursor {
  startsAt: string;
  id: string;
}

/** Opaque to clients: base64url of the last item's `(starts_at, id)` keyset. */
export function encodeCursor(cursor: BookingCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): BookingCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { startsAt, id } = parsed as Record<string, unknown>;
    if (!Instant.safeParse(startsAt).success || !z.uuid().safeParse(id).success) return null;
    return { startsAt: String(startsAt), id: String(id) };
  } catch {
    return null;
  }
}

export const ListOwnerBookingsInputSchema = z
  .strictObject({
    from: LocalDate.optional().describe('Only bookings with a day on or after this date'),
    to: LocalDate.optional().describe('Only bookings with a day on or before this date'),
    cursor: z
      .string()
      .max(300)
      .refine((v) => decodeCursor(v) !== null, 'Malformed cursor')
      .optional()
      .describe('The nextCursor of the previous page'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .refine((v) => v.from === undefined || v.to === undefined || v.to >= v.from, {
    path: ['to'],
    message: 'to must not be before from',
  })
  .meta({ id: 'ListOwnerBookingsInput' });
export type ListOwnerBookingsInput = z.infer<typeof ListOwnerBookingsInputSchema>;

export const OwnerBookingSchema = z
  .object({
    id: z.uuid(),
    status: z.enum(['active', 'cancelled']),
    renter: z.object({ name: z.string(), email: z.email() }),
    seat: z.object({ id: z.uuid(), label: z.string() }),
    pass: z.enum(['day', 'week', 'month']),
    slot: z.enum(['day', 'night', 'full_day', 'working_hours']),
    startDate: LocalDate,
    endDate: LocalDate,
    timeZone: TimeZone,
    firstStartsAt: Instant,
    lastEndsAt: Instant,
    price: z.object({ amount: z.string(), currency: CurrencyCode }),
    createdAt: Instant,
  })
  .meta({ id: 'OwnerBooking' });
export type OwnerBooking = z.infer<typeof OwnerBookingSchema>;

export const OwnerBookingListSchema = z
  .object({
    items: z.array(OwnerBookingSchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'OwnerBookingList' });
export type OwnerBookingList = z.infer<typeof OwnerBookingListSchema>;
