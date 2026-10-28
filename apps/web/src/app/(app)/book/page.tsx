import type { Metadata } from 'next';

import { BookView } from '@/components/book-view';

export const metadata: Metadata = { title: 'Book a seat' };

export default function BookPage() {
  return (
    <main id="main" className="mx-auto grid max-w-4xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Book a seat</h1>
      <BookView />
    </main>
  );
}
