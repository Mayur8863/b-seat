import type { ReactNode } from 'react';

import { SpaceShell } from '@/components/space-shell';

export default async function SpaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  return <SpaceShell spaceId={spaceId}>{children}</SpaceShell>;
}
