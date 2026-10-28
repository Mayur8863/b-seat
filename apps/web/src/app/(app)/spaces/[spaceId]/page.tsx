import type { Metadata } from 'next';

import { ListingDetails } from '@/components/listing-details';

export const metadata: Metadata = { title: 'Space' };

export default async function ListingPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  return <ListingDetails spaceId={spaceId} />;
}
