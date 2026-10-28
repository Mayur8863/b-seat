import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { z } from 'zod';

import { ListingDetails } from '@/components/listing-details';

export const metadata: Metadata = { title: 'Space' };

export default async function ListingPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  if (!z.uuid().safeParse(spaceId).success) notFound();
  return <ListingDetails spaceId={spaceId} />;
}
