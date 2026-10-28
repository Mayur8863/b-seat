import type { ComponentProps } from 'react';

/** A named, keyboard-focusable scroll container (axe scrollable-region-focusable). `aria-label` is required. */
export function ScrollRegion({
  className = '',
  ...props
}: Omit<ComponentProps<'div'>, 'role' | 'tabIndex'> & { 'aria-label': string }) {
  return (
    <div
      role="region"
      tabIndex={0}
      {...props}
      className={`focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
    />
  );
}
