import type { Metadata } from 'next';

import { SpacePhotoManager } from '@/components/space-photo-manager';

export const metadata: Metadata = { title: 'Photos' };

export default async function PhotosPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  return <SpacePhotoManager spaceId={spaceId} />;
}
