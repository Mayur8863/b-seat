import { Label } from '@bseat/ui/components/label';
import type { ReactNode } from 'react';

interface FormFieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: (aria: {
    id: string;
    'aria-invalid': true | undefined;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}

/** Label above, optional hint and error below, linked to the control with aria-describedby. */
export function FormField({ id, label, hint, error, className, children }: FormFieldProps) {
  const describedBy = [hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={`grid gap-2 ${className ?? ''}`}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}
      {hint && (
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
