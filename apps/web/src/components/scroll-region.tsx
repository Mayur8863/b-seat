import type { ComponentProps } from 'react';

// A region that scrolls must be reachable by keyboard (axe: scrollable-region-focusable).
// jsx-a11y's no-noninteractive-tabindex cannot know the region overflows, so the pair is set
// here once, in one reviewed place, instead of on each element.
const SCROLLABLE = { role: 'region', tabIndex: 0 } as const;

/** A named, keyboard-focusable scroll container. `aria-label` is required. */
export function ScrollRegion({
  className = '',
  ...props
}: Omit<ComponentProps<'div'>, 'role' | 'tabIndex'> & { 'aria-label': string }) {
  return (
    <div
      {...SCROLLABLE}
      {...props}
      className={`focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
    />
  );
}
