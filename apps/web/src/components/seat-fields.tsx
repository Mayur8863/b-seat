import type { Cubicle } from '@bseat/api-client';
import { Button } from '@bseat/ui/components/button';
import { NativeSelect, NativeSelectOption } from '@bseat/ui/components/native-select';
import type { ComponentProps } from 'react';

import { FormField } from '@/components/space-form/form-field';

export interface CubicleOptions {
  cubicles: Cubicle[] | undefined;
  failed: boolean;
  onRetry: () => void;
}

export const FEATURES_HINT =
  'Separate with commas, for example standing desk, monitor arm. Up to 10, 40 characters each.';

type SelectProps = Omit<ComponentProps<'select'>, 'id' | 'size'>;

/** Cubicle select with the loading and error states of ui/02 7.1; shared by the add and edit forms. */
export function CubicleField({
  id,
  options,
  ...select
}: SelectProps & { id: string; options: CubicleOptions }) {
  const { cubicles, failed, onRetry } = options;
  return (
    <FormField
      id={id}
      label="Cubicle (optional)"
      hint={
        failed ? (
          <>
            We couldn&apos;t load cubicles.{' '}
            <Button type="button" variant="link" size="sm" onClick={onRetry}>
              Try again
            </Button>
          </>
        ) : undefined
      }
    >
      {(aria) => (
        <NativeSelect {...aria} {...select} className="w-full">
          {!cubicles && !failed ? (
            <NativeSelectOption value="" disabled>
              Loading cubicles…
            </NativeSelectOption>
          ) : (
            <NativeSelectOption value="">No cubicle</NativeSelectOption>
          )}
          {cubicles?.map((c) => (
            <NativeSelectOption key={c.id} value={c.id} className="break-words">
              {c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </FormField>
  );
}
