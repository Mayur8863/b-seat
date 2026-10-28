import type { ReactNode } from 'react';

import { OwnerGate } from '@/components/owner-gate';

export default function OwnerLayout({ children }: { children: ReactNode }) {
  return <OwnerGate>{children}</OwnerGate>;
}
