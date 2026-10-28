import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { z } from 'zod';

import { SpaceShell } from '@/components/space-shell';

export default async function SpaceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  // A malformed id can never name a space, so skip the API call and show the 404 page.
  if (!z.uuid().safeParse(spaceId).success) notFound();
  return <SpaceShell spaceId={spaceId}>{children}</SpaceShell>;
}
