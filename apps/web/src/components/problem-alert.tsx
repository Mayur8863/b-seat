'use client';

import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Ref } from 'react';

import { type BookingAction, describeProblem, type ProblemContext } from '@/lib/booking-problems';

interface Props {
  error: unknown;
  action: BookingAction;
  context?: ProblemContext;
  onRetry?: () => void;
  ref?: Ref<HTMLDivElement>;
}

/** Destructive alert with the ui.md section 6 copy for an API error. */
export function ProblemAlert({ error, action, context, onRetry, ref }: Props) {
  const pathname = usePathname();
  const copy = describeProblem(error, action, { ...context, path: context?.path ?? pathname });
  return (
    <Alert variant="destructive" role="alert" ref={ref} tabIndex={-1}>
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription>
        {copy.description.map((part) =>
          typeof part === 'string' ? (
            part
          ) : (
            <Link key={part.href} href={part.href} className="underline underline-offset-4">
              {part.text}
            </Link>
          ),
        )}
        {onRetry && (
          <div className="mt-3">
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
