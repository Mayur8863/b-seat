import type { Metadata } from 'next';

import { OwnerBookings } from '@/components/owner-bookings';

export const metadata: Metadata = { title: 'Bookings' };

export default async function BookingsPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  return <OwnerBookings spaceId={spaceId} />;
}
