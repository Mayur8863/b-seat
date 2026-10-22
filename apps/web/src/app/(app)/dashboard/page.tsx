import type { Metadata } from 'next';

import { SignOutButton } from '@/components/sign-out-button';
import { Welcome } from '@/components/welcome';

export const metadata: Metadata = { title: 'Dashboard' };

export default function DashboardPage() {
  return (
    <main id="main" className="mx-auto grid max-w-4xl gap-6 px-6 py-12">
      <div className="flex items-center justify-between gap-4">
        <Welcome />
        <SignOutButton />
      </div>
      <p className="text-muted-foreground">Your bookings will appear here.</p>
    </main>
  );
}
