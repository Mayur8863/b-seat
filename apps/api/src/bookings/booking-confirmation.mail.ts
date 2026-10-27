import { toLocal } from '../common/time/zoned-time.js';
import type { MailJob } from '../mail/mail.types.js';

/** What the confirmation needs of a booking; the pass booking response (T036) satisfies it too. */
export interface BookingConfirmationSource {
  id: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  seat: { label: string };
  space: { name: string; location: string };
}

/** The mail queue job id: BullMQ drops a second job with the same id (no `:`, BullMQ 6 rejects it). */
export function confirmationJobId(bookingId: string): string {
  return `booking-confirmed-${bookingId}`;
}

// The local date is a calendar date, so read its weekday in UTC to avoid any zone shift.
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });

/**
 * The booking confirmation (contracts/booking-email.md). Times are the space's wall-clock,
 * derived from the instants. Plain text only, so `user.name` needs no escaping.
 */
export function buildBookingConfirmation(
  booking: BookingConfirmationSource,
  user: { name: string; email: string },
  appUrl: string,
): MailJob {
  const start = toLocal(new Date(booking.startsAt), booking.timeZone);
  const end = toLocal(new Date(booking.endsAt), booking.timeZone);
  const day = weekday.format(new Date(`${start.date}T12:00:00Z`));
  const bookingsUrl = `${appUrl.replace(/\/+$/, '')}/bookings`;

  return {
    to: user.email,
    subject: `Seat ${booking.seat.label} booked at ${booking.space.name} on ${start.date}`,
    text: [
      `Hi ${user.name},`,
      '',
      'Your seat is booked.',
      '',
      `Space:  ${booking.space.name} (${booking.space.location})`,
      `Seat:   ${booking.seat.label}`,
      `When:   ${day} ${start.date}, ${start.time}–${end.time} (${booking.timeZone})`,
      '',
      `You can see or cancel your bookings at ${bookingsUrl}.`,
      '',
      'BSeat',
      '',
    ].join('\n'),
  };
}
