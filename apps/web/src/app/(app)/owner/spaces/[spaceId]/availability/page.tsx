import type { Metadata } from 'next';

import { AvailabilityView } from '@/components/availability-view';

export const metadata: Metadata = { title: 'Availability' };

export default async function AvailabilityPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  return <AvailabilityView spaceId={spaceId} />;
}
