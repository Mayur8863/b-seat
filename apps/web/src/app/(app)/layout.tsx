import type { ReactNode } from 'react';

import { AppNav } from '@/components/app-nav';

/** Signed-in shell. Pages keep their own <main id="main">; the root skip link targets it. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="bg-background relative border-b">
        <AppNav />
      </header>
      {children}
    </>
  );
}
