import type { Metadata } from 'next';

import { SpaceForm } from '@/components/space-form';

export const metadata: Metadata = { title: 'List a space' };

export default function NewSpacePage() {
  return (
    <main id="main" className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">List a space</h1>
        <p className="text-muted-foreground">
          Add your space&apos;s details. You&apos;ll add seats and prices next.
        </p>
        <p className="text-muted-foreground text-sm">
          All fields are required unless marked optional.
        </p>
      </header>
      <div className="max-w-3xl">
        <SpaceForm mode="create" />
      </div>
    </main>
  );
}
