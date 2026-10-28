import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@bseat/ui/components/radio-group';
import { useController, type UseFormReturn } from 'react-hook-form';

import type { FormOutput, FormValues } from '@/lib/space-form-values';

import { FormField } from './form-field';

interface Props {
  form: UseFormReturn<FormValues, unknown, FormOutput>;
  fid: (name: string) => string;
  isEdit: boolean;
  inputSize: string;
}

/** Opening-hours choice and the time fields it reveals (ui/02 4.1 rows 9 to 11). */
export function OpeningHoursFieldset({ form, fid, isEdit, inputSize }: Props) {
  const { control, register } = form;
  const errors = form.formState.errors;
  const {
    field: { value: modeValue, onChange: modeChange, onBlur: modeBlur, ref: modeRef },
  } = useController({ control, name: 'mode' });
  const modeError = errors.mode?.message;

  const tile = (value: string) =>
    `flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring ${
      modeValue === value ? 'border-primary ring-1 ring-primary bg-primary/5' : ''
    }`;

  return (
    <fieldset className="grid min-w-0 gap-3 md:col-span-2">
      <legend id={fid('mode-legend')} className="text-sm font-medium">
        Opening hours
      </legend>
      {isEdit && (
        <p className="text-muted-foreground text-sm">
          Changing opening hours applies to new bookings only. Existing bookings keep their times.
          Check Passes and prices afterwards.
        </p>
      )}
      <RadioGroup
        aria-labelledby={fid('mode-legend')}
        aria-invalid={modeError ? true : undefined}
        aria-describedby={modeError ? fid('mode-error') : undefined}
        value={modeValue}
        onValueChange={modeChange}
        onBlur={modeBlur}
      >
        <Label htmlFor={fid('always')} className={tile('always_open')}>
          <RadioGroupItem
            id={fid('always')}
            value="always_open"
            ref={modeRef}
            aria-labelledby={fid('always-title')}
            aria-describedby={fid('always-desc')}
          />
          <span className="grid gap-1">
            <span id={fid('always-title')}>Open 24 hours</span>
            <span id={fid('always-desc')} className="text-muted-foreground text-sm font-normal">
              Renters can book day, night and 24-hour slots.
            </span>
          </span>
        </Label>
        <Label htmlFor={fid('fixed')} className={tile('fixed_hours')}>
          <RadioGroupItem
            id={fid('fixed')}
            value="fixed_hours"
            aria-labelledby={fid('fixed-title')}
            aria-describedby={fid('fixed-desc')}
          />
          <span className="grid gap-1">
            <span id={fid('fixed-title')}>Fixed working hours</span>
            <span id={fid('fixed-desc')} className="text-muted-foreground text-sm font-normal">
              One working-hours slot, for example 09:00 to 18:00.
            </span>
          </span>
        </Label>
      </RadioGroup>
      {modeError && (
        <p id={fid('mode-error')} className="text-destructive text-sm">
          {modeError}
        </p>
      )}
      {modeValue === 'always_open' && (
        <FormField
          id={fid('shift')}
          label="Shift change time"
          error={errors.shiftChangeAt?.message}
          hint="When the day slot starts, for example 07:00. You can also change it under Passes and prices."
        >
          {(aria) => (
            <Input
              {...aria}
              type="time"
              min="00:00"
              max="11:59"
              className={`${inputSize} md:max-w-48`}
              {...register('shiftChangeAt')}
            />
          )}
        </FormField>
      )}
      {modeValue === 'fixed_hours' && (
        <div className="grid gap-4 md:grid-cols-2">
          <FormField id={fid('opens')} label="Opens at" error={errors.opensAt?.message}>
            {(aria) => (
              <Input {...aria} type="time" className={inputSize} {...register('opensAt')} />
            )}
          </FormField>
          <FormField
            id={fid('closes')}
            label="Closes at"
            error={errors.closesAt?.message}
            hint="Closing time must be after opening time on the same day."
          >
            {(aria) => (
              <Input {...aria} type="time" className={inputSize} {...register('closesAt')} />
            )}
          </FormField>
        </div>
      )}
    </fieldset>
  );
}
