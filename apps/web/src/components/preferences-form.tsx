'use client';

import { type Preferences, useMeUpdatePreferences, useReferenceGet } from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import { NativeSelect } from '@bseat/ui/components/native-select';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

export interface PreferenceValues {
  country: string | null;
  city: string | null;
  area: string | null;
}

const TOO_LONG = 'Use 100 characters or fewer';
const schema = z.object({
  country: z.string(),
  city: z.string().trim().max(100, TOO_LONG),
  area: z.string().trim().max(100, TOO_LONG),
});
type FormValues = z.infer<typeof schema>;

const orNull = (value: string) => (value === '' ? null : value);

interface Props {
  /** `signup` is the optional step after sign-up; `edit` is the dashboard card. */
  variant: 'signup' | 'edit';
  initial: PreferenceValues;
  /** `skipped` means nothing was sent because every field was empty (signup only). */
  onSaved: (outcome: 'saved' | 'skipped', saved?: Preferences) => void;
  /** Signup only: the save failed but the account stands, so the caller moves on. */
  onFailed?: () => void;
  /** "Skip for now" (signup) or "Cancel" (edit). */
  onDismiss: () => void;
}

/** Country, city and area fields shared by the sign-up step and the dashboard card. */
export function PreferencesForm({ variant, initial, onSaved, onFailed, onDismiss }: Props) {
  const id = useId();
  const isEdit = variant === 'edit';
  const reference = useReferenceGet();
  const save = useMeUpdatePreferences();
  const alertRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      country: initial.country ?? '',
      city: initial.city ?? '',
      area: initial.area ?? '',
    },
  });

  // Edit mode moves focus into the form; the sign-up step leaves it on the page heading.
  // The ref captures the state at mount so later reference changes do not steal focus.
  const referenceReadyAtMount = useRef(Boolean(reference.data));
  useEffect(() => {
    if (isEdit) setFocus(referenceReadyAtMount.current ? 'country' : 'city');
  }, [isEdit, setFocus]);

  useEffect(() => {
    if (failed) alertRef.current?.focus();
  }, [failed]);

  const submit = handleSubmit((values) => {
    const data = {
      country: orNull(values.country),
      city: orNull(values.city.trim()),
      area: orNull(values.area.trim()),
    };
    if (!isEdit && !data.country && !data.city && !data.area) {
      onSaved('skipped');
      return;
    }
    setFailed(false);
    save.mutate(
      { data },
      {
        onSuccess: (response) => {
          onSaved('saved', response.data);
        },
        onError: () => {
          if (onFailed) onFailed();
          else setFailed(true);
        },
      },
    );
  });

  const saving = save.isPending;
  const countries = reference.data?.data.countries ?? [];

  const textField = (name: 'city' | 'area', label: string, autoComplete?: string) => {
    const error = errors[name]?.message;
    return (
      <div className="grid gap-2">
        <Label htmlFor={`${id}-${name}`}>{label}</Label>
        <Input
          id={`${id}-${name}`}
          autoComplete={autoComplete}
          disabled={saving}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-${name}-error` : undefined}
          {...register(name)}
        />
        {error && (
          <p id={`${id}-${name}-error`} className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="grid gap-4">
      {failed && (
        <Alert ref={alertRef} variant="destructive" role="alert" tabIndex={-1}>
          <AlertTitle>We couldn&apos;t save your preferences</AlertTitle>
          <AlertDescription>Your previous preferences are unchanged. Try again.</AlertDescription>
        </Alert>
      )}
      <div className={isEdit ? 'grid gap-4 md:grid-cols-3' : 'grid gap-4'}>
        <div className="grid content-start gap-2">
          {reference.isError ? (
            <span className="text-sm leading-none font-medium">Country</span>
          ) : (
            <Label htmlFor={`${id}-country`}>Country</Label>
          )}
          {reference.isError ? (
            <p id={`${id}-country-help`} className="text-muted-foreground text-sm">
              {isEdit
                ? 'Country unavailable right now.'
                : "We couldn't load the country list. You can add it later from your dashboard."}{' '}
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => {
                  void reference.refetch();
                }}
              >
                Try again
              </Button>
            </p>
          ) : (
            <NativeSelect
              // Remount when the list arrives so the stored country is applied to the new options.
              key={reference.isPending ? 'loading' : 'ready'}
              id={`${id}-country`}
              disabled={saving || reference.isPending}
              aria-busy={reference.isPending || undefined}
              className="w-full"
              {...register('country')}
            >
              {reference.isPending ? (
                <option value="">Loading countries…</option>
              ) : (
                <>
                  <option value="">No preference</option>
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </>
              )}
            </NativeSelect>
          )}
        </div>
        {textField('city', 'City', 'address-level2')}
        {textField('area', 'Area or locality')}
      </div>
      <div className={isEdit ? 'flex flex-wrap gap-2' : 'grid gap-2'}>
        <Button type="submit" disabled={saving} aria-busy={saving || undefined}>
          {saving ? (
            <>
              <Loader2Icon aria-hidden="true" className="animate-spin" />
              Saving…
            </>
          ) : isEdit ? (
            'Save preferences'
          ) : (
            'Save and continue'
          )}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onDismiss}>
          {isEdit ? 'Cancel' : 'Skip for now'}
        </Button>
        {isEdit && (
          <Button
            type="button"
            variant="link"
            size="sm"
            disabled={saving}
            onClick={() => {
              // Without the list the country cannot be edited, so it is kept (ui/01 6.2).
              reset({
                country: reference.isError ? (initial.country ?? '') : '',
                city: '',
                area: '',
              });
            }}
          >
            Clear all
          </Button>
        )}
      </div>
    </form>
  );
}
