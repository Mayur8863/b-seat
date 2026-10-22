import { Button } from '@bseat/ui/components/button';
import Link from 'next/link';

export default function HomePage() {
  return (
    <main id="main" className="mx-auto flex max-w-2xl flex-col items-start gap-6 px-6 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Book a seat in seconds.</h1>
      <p className="text-muted-foreground text-lg">
        BSeat shows which desks are free and lets you reserve one for the time you need.
      </p>
      <div className="flex gap-3">
        <Button asChild>
          <Link href="/sign-up">Create an account</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    </main>
  );
}
