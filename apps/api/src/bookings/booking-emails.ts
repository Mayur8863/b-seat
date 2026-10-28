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

const PASS = { day: 'Day pass', week: 'Weekly pass', month: 'Monthly pass' } as const;
const SLOT = {
  day: 'Day',
  night: 'Night',
  full_day: '24 hours',
  working_hours: 'Working hours',
} as const;

// A local date is a calendar date, so read its weekday in UTC to avoid any zone shift.
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });
const withWeekday = (date: string) => `${weekday.format(new Date(`${date}T12:00:00Z`))} ${date}`;

/** Space and seat names are owner-controlled: a line break in a subject would inject headers. */
const oneLine = (text: string) => text.replace(/[\r\n]+/g, ' ');

function sharedLines(b: Booking): string[] {
  const { startTime, endTime, endsNextDay } = b.slotTimes;
  const days = b.days.length > 0 ? b.days.length : daysBetween(b);
  const closed = b.skippedDates.length > 0 ? `; closed: ${b.skippedDates.join(', ')}` : '';
  return [
    `Space:   ${b.space.name}, ${b.space.area}, ${b.space.city}`,
    `Seat:    ${b.seat.label}${b.seat.cubicleName ? ` (cubicle ${b.seat.cubicleName})` : ''}`,
    `Pass:    ${PASS[b.pass]}, ${SLOT[b.slot]} slot (${startTime}–${endTime}${endsNextDay ? ' next day' : ''})`,
    `Period:  ${withWeekday(b.startDate)} to ${withWeekday(b.endDate)} (${b.timeZone}); ${days} days included${closed}`,
    `Price:   ${b.price.amount} ${b.price.currency}`,
    'Payment is made directly to the owner. BSeat does not take payment.',
  ];
}

/** Days in the period that are not closed, when the occurrence list is not at hand. */
function daysBetween(b: Booking): number {
  const ms = Date.parse(`${b.endDate}T00:00:00Z`) - Date.parse(`${b.startDate}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1 - b.skippedDates.length;
}

/** The renter confirmation and the owner notification (contracts/booking-emails.md). Plain text. */
export function buildBookingEmails(
  b: Booking,
  renter: EmailRecipient,
  owner: EmailRecipient,
  appUrl: string,
): { renter: MailJob; owner: MailJob } {
  const base = appUrl.replace(/\/+$/, '');
  const space = oneLine(b.space.name);
  const label = oneLine(b.seat.label);
  return {
    renter: {
      to: renter.email,
      subject: `Booking confirmed: seat ${label} at ${space} from ${b.startDate}`,
      text: [
        `Hi ${renter.name},`,
        '',
        'Your seat is booked.',
        '',
        ...sharedLines(b),
        '',
        `You can see your bookings at ${base}/bookings.`,
        'You can cancel there until the first slot starts.',
        '',
        'BSeat',
        '',
      ].join('\n'),
    },
    owner: {
      to: owner.email,
      subject: `New booking at ${space}: seat ${label} from ${b.startDate}`,
      text: [
        `Hi ${owner.name},`,
        '',
        `${renter.name} booked a seat at your space.`,
        '',
        ...sharedLines(b),
        '',
        `See the bookings for this space at ${base}/owner/spaces/${b.space.id}/bookings.`,
        '',
        'BSeat',
        '',
      ].join('\n'),
    },
  };
}
