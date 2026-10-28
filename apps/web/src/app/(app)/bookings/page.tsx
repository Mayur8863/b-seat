import type { Metadata } from 'next';

import { MyBookings } from '@/components/my-bookings';

export const metadata: Metadata = { title: 'My bookings' };

export default function BookingsPage() {
  return (
    <main id="main" className="mx-auto grid w-full max-w-4xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <MyBookings />
    </main>
  );
}
