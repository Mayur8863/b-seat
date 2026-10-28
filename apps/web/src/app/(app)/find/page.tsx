import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ListingSearchForm } from '@/components/listing-search-form';

export const metadata: Metadata = { title: 'Find a space' };

export default function FindPage() {
  return (
    <main id="main" className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Find a space</h1>
        <p className="text-muted-foreground">Search by location. Choose a country to start.</p>
      </div>
      {/* useSearchParams needs a boundary for static rendering. */}
      <Suspense>
        <ListingSearchForm />
      </Suspense>
    </main>
  );
}
