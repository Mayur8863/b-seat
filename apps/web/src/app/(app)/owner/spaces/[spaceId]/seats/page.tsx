import type { Metadata } from 'next';

import { SeatManager } from '@/components/seat-manager';

export const metadata: Metadata = { title: 'Seats' };

export default async function SeatsPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  return <SeatManager spaceId={spaceId} />;
}
