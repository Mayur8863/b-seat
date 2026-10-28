'use client';

import { cn } from '@bseat/ui/lib/utils';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Management pages of a space (ui/01 3.2). Each page task adds its own entry. */
export const MANAGE_LINKS: readonly { label: string; segment: string }[] = [
  { label: 'Details', segment: '' },
  { label: 'Seats', segment: '/seats' },
  { label: 'Passes and prices', segment: '/pricing' },
  { label: 'Layout', segment: '/layout' },
  { label: 'Availability', segment: '/availability' },
  { label: 'Bookings', segment: '/bookings' },
];

export const manageHref = (spaceId: string, segment: string) =>
  `/owner/spaces/${spaceId}${segment}` as Route;

export function SpaceManageNav({ spaceId }: { spaceId: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Space management" className="md:border-b">
      <ul className="flex gap-1 overflow-x-auto md:flex-wrap md:overflow-visible">
        {MANAGE_LINKS.map(({ label, segment }) => {
          const href = manageHref(spaceId, segment);
          const current = pathname === href;
          return (
            <li key={label}>
              <Link
                href={href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'hover:bg-muted focus-visible:outline-ring inline-flex min-h-11 items-center px-3 whitespace-nowrap focus-visible:outline-2 md:min-h-9',
                  current
                    ? 'border-primary text-foreground border-b-2 font-medium'
                    : 'text-muted-foreground',
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
