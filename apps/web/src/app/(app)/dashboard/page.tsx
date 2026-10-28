import type { Metadata } from 'next';

import { DashboardView } from '@/components/dashboard-view';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <main id="main" className="mx-auto grid max-w-4xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <DashboardView />
    </main>
  );
}
