import type { MailJob } from '../mail/mail.types.js';
import type { Booking } from './bookings.schemas.js';

export interface EmailRecipient {
  name: string;
  email: string;
}

export function renterJobId(bookingId: string): string {
  return `booking-confirmed-${bookingId}`;
}

export function ownerJobId(bookingId: string): string {
  return `booking-owner-notified-${bookingId}`;
}

export function buildBookingEmails(
  _booking: Booking,
  _renter: EmailRecipient,
  _owner: EmailRecipient,
  _appUrl: string,
): { renter: MailJob; owner: MailJob } {
  throw new Error('not implemented');
}
