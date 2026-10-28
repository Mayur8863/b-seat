'use client';

import { ApiError, useMeGet } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Skeleton } from '@bseat/ui/components/skeleton';
import { cn } from '@bseat/ui/lib/utils';
import { MenuIcon, XIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { DASHBOARD, navActive, navLinksFor, type NavLink } from '@/lib/nav';
import { safeNext } from '@/lib/safe-next';

import { SignOutButton } from './sign-out-button';

const linkClass =
  'text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-ring rounded-md px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 max-sm:flex max-sm:min-h-11 max-sm:items-center aria-[current]:bg-secondary aria-[current]:text-secondary-foreground aria-[current]:font-medium';

function NavItem({
  link,
  pathname,
  onNavigate,
}: {
  link: NavLink;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        href={link.href}
        aria-current={navActive(link, pathname)}
        className={linkClass}
        onClick={onNavigate}
      >
        {link.label}
      </Link>
    </li>
  );
}

/** Header content: brand, role-aware main nav, user name and sign out, plus account notices. */
export function AppNav() {
  const pathname = usePathname();
  const { data, isPending, error, refetch, isRefetching } = useMeGet();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const unauthorized = error instanceof ApiError && error.status === 401;
  const me = data?.data;
  // A failed background refetch keeps the cached account; only a 401 or a cold failure replaces it.
  const showError = error !== null && (unauthorized || !data);
  // Any navigation closes the mobile panel, not only a nav link click. Adjusting state during
  // render (rather than in an effect) avoids a frame with a stale open panel.
  const [panelPath, setPanelPath] = useState(pathname);
  if (panelPath !== pathname) {
    setPanelPath(pathname);
    setOpen(false);
  }

  // Escape closes the mobile panel and returns focus to its toggle (no focus trap).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
  };
  const links = me ? navLinksFor(me.accountType === 'owner' ? 'owner' : 'renter') : [];

  return (
    <div>
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link
          href="/dashboard"
          className="focus-visible:outline-ring rounded-md font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          BSeat
        </Link>
        {unauthorized ? null : (
          <>
            <Button
              ref={toggleRef}
              type="button"
              variant="outline"
              size="icon"
              className="ml-auto size-11 sm:hidden"
              aria-label="Menu"
              aria-expanded={open}
              aria-controls="main-nav-list"
              onClick={() => {
                setOpen((v) => !v);
              }}
            >
              {open ? <XIcon aria-hidden="true" /> : <MenuIcon aria-hidden="true" />}
            </Button>
            {isPending ? (
              <span role="status" aria-live="polite" className="sr-only">
                Loading navigation…
              </span>
            ) : null}
            <nav
              aria-label="Main"
              aria-busy={isPending}
              className={cn(
                'max-sm:bg-background max-sm:absolute max-sm:inset-x-0 max-sm:top-14 max-sm:border-b max-sm:p-2 sm:flex sm:flex-1',
                !open && 'max-sm:hidden',
              )}
            >
              {isPending ? (
                <ul
                  id="main-nav-list"
                  aria-hidden="true"
                  className="grid gap-1 sm:flex sm:gap-1 lg:gap-2"
                >
                  {[0, 1, 2].map((i) => (
                    <li key={i}>
                      <Skeleton className="h-8 w-24" />
                    </li>
                  ))}
                </ul>
              ) : (
                <ul
                  id="main-nav-list"
                  className="grid gap-1 sm:flex sm:flex-1 sm:items-center sm:gap-1 lg:gap-2"
                >
                  {showError ? (
                    <NavItem link={DASHBOARD} pathname={pathname} onNavigate={close} />
                  ) : (
                    links.map((l) => (
                      <NavItem key={l.label} link={l} pathname={pathname} onNavigate={close} />
                    ))
                  )}
                  <li className="sm:ml-auto sm:flex sm:items-center sm:gap-4">
                    {me ? (
                      <span className="text-muted-foreground hidden text-sm lg:inline">
                        {me.name}
                      </span>
                    ) : null}
                    <SignOutButton className="max-sm:min-h-11" />
                  </li>
                </ul>
              )}
            </nav>
          </>
        )}
      </div>

      {showError ? (
        <div className="mx-auto max-w-6xl px-4 pb-3 sm:px-6">
          {unauthorized ? (
            <Alert variant="destructive" role="alert">
              <AlertTitle>Your session has ended</AlertTitle>
              <AlertDescription>
                Sign in again to continue.{' '}
                <Link
                  href={`/sign-in?next=${encodeURIComponent(safeNext(pathname))}`}
                  className="underline"
                >
                  Sign in
                </Link>
              </AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive" role="alert">
              <AlertTitle>We couldn&apos;t load your account</AlertTitle>
              <AlertDescription>
                Check your connection and try again.
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 max-sm:min-h-11"
                  disabled={isRefetching}
                  onClick={() => void refetch()}
                >
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </div>
      ) : null}
    </div>
  );
}
