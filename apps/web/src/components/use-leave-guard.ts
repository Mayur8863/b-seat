'use client';

import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

interface Target {
  href: string;
  el: HTMLElement;
}

/**
 * Guards leaving a page while `active` (FR-007). `beforeunload` covers reload, close and external links.
 * The App Router has no route-change blocking API, so same-origin link clicks are caught in the capture
 * phase and held in `target` until the owner chooses (research R-9).
 */
export function useLeaveGuard(active: boolean) {
  const router = useRouter();
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!(e.target instanceof Element)) return;
      const a = e.target.closest('a[href]');
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target !== '' && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search)
        return;
      e.preventDefault();
      e.stopPropagation();
      setTarget({ href: `${url.pathname}${url.search}${url.hash}`, el: a });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [active]);

  const stay = useCallback(() => {
    const el = target?.el;
    setTarget(null);
    // Focus returns to the link that was activated.
    if (el)
      requestAnimationFrame(() => {
        el.focus();
      });
  }, [target]);

  const leave = useCallback(() => {
    if (!target) return;
    const { href } = target;
    setTarget(null);
    router.push(href as Route);
  }, [target, router]);

  return { pending: target !== null, stay, leave };
}
