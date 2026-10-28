import type { Metadata } from 'next';

import { LayoutEditor } from '@/components/layout-editor';

export const metadata: Metadata = { title: 'Layout' };

export default async function LayoutPage({ params }: { params: Promise<{ spaceId: string }> }) {
  const { spaceId } = await params;
  return <LayoutEditor spaceId={spaceId} />;
}
