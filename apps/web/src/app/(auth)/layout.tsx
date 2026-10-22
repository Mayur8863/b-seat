import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="mx-auto grid min-h-dvh max-w-sm content-center px-6">
      {children}
    </main>
  );
}
