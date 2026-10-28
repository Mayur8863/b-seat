'use client';

import type * as React from 'react';
import { cn } from '@bseat/ui/lib/utils';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';

// The unchecked box is the control, so its border is `muted-foreground`: `border-input`
// is only 1.26:1 on the background (tokens F2).
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer border-muted-foreground focus-visible:ring-ring/50 focus-visible:border-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="group grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon aria-hidden="true" className="group-data-[state=indeterminate]:hidden" />
        <MinusIcon aria-hidden="true" className="hidden group-data-[state=indeterminate]:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
