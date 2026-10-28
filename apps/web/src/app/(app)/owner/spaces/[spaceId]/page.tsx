import type { Metadata } from 'next';

import { SpaceDetails } from '@/components/space-details';

export const metadata: Metadata = { title: 'Space details' };

export default async function SpaceDetailsPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  return <SpaceDetails spaceId={spaceId} />;
}
