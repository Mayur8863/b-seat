'use client';

import {
  ApiError,
  type CreateSpaceInput,
  getOwnerSpacesGetQueryKey,
  getOwnerSpacesListQueryKey,
  type OwnerSpace,
  type UpdateSpaceInput,
  useOwnerSpacesCreate,
  useOwnerSpacesUpdate,
  useReferenceGet,
} from '@bseat/api-client';
import { Alert, AlertDescription, AlertTitle } from '@bseat/ui/components/alert';
import { Button } from '@bseat/ui/components/button';
import { Checkbox } from '@bseat/ui/components/checkbox';
import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@bseat/ui/components/native-select';
import { RadioGroup, RadioGroupItem } from '@bseat/ui/components/radio-group';
import { toast } from '@bseat/ui/components/sonner';
import { Textarea } from '@bseat/ui/components/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheckIcon, Loader2Icon, PlusIcon, XIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { useController, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { utilityLabel } from '@/lib/format';
import { describeOwnerProblem } from '@/lib/marketplace-problems';
import { offeredTimeZones } from '@/lib/time-zones';
import type { ProblemCopy } from '@/lib/booking-problems';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_CUSTOM = 5;
const DEFAULT_SHIFT = '07:00';

const required = (max: number, empty: string) =>
  z.string().trim().min(1, empty).max(max, `Use ${max} characters or fewer`);

const schema = z
  .object({
    name: required(100, 'Enter a name'),
    description: z
      .string()
      .trim()
      .min(1, 'Enter a description')
      .max(2000, 'Use 2,000 characters or fewer'),
    country: z.string().min(1, 'Choose a country'),
    city: required(100, 'Enter a city'),
    area: required(100, 'Enter an area or locality'),
    streetAddress: required(200, 'Enter a street address'),
    timeZone: z.string().min(1, 'Choose a time zone'),
    currency: z.string().min(1, 'Choose a currency'),
    mode: z.string(),
    shiftChangeAt: z.string(),
    opensAt: z.string(),
    closesAt: z.string(),
    utilities: z.array(z.string()),
    customUtilities: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    const issue = (path: string, message: string) => {
      ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (v.mode === 'always_open') {
      if (!v.shiftChangeAt) issue('shiftChangeAt', 'Enter a shift change time');
      else if (!HHMM.test(v.shiftChangeAt) || v.shiftChangeAt > '11:59') {
        issue('shiftChangeAt', 'Use a time from 00:00 to 11:59');
      }
    } else if (v.mode === 'fixed_hours') {
      if (!v.opensAt) issue('opensAt', 'Enter an opening time');
      if (!v.closesAt) issue('closesAt', 'Enter a closing time');
      else if (v.opensAt && v.closesAt <= v.opensAt) {
        issue('closesAt', 'Closing time must be after the opening time');
      }
    } else {
      issue('mode', 'Choose when your space is open');
    }
  });

type FormValues = z.infer<typeof schema>;
type FieldName = keyof FormValues;

const TEXT_FIELDS = [
  'name',
  'description',
  'country',
  'city',
  'area',
  'streetAddress',
  'timeZone',
  'currency',
] as const;

/** Maps an API error path (`openingHours.closesAt`, `customUtilities.2`) to a form field. */
function fieldForPath(path: string): FieldName | undefined {
  const [head, tail] = path.split('.');
  if (head === 'openingHours') {
    if (tail === 'shiftChangeAt' || tail === 'opensAt' || tail === 'closesAt') return tail;
    return 'mode';
  }
  return (TEXT_FIELDS as readonly string[]).includes(head ?? '') ||
    head === 'utilities' ||
    head === 'customUtilities'
    ? (head as FieldName)
    : undefined;
}

const SERVER_MESSAGE: Partial<Record<FieldName, string>> = {
  timeZone: "That time zone isn't supported. Choose one from the list.",
};

function valuesFor(space?: OwnerSpace): FormValues {
  const hours = space?.openingHours;
  return {
    name: space?.name ?? '',
    description: space?.description ?? '',
    country: space?.country ?? '',
    city: space?.city ?? '',
    area: space?.area ?? '',
    streetAddress: space?.streetAddress ?? '',
    timeZone: space?.timeZone ?? '',
    currency: space?.currency ?? '',
    mode: hours?.mode ?? '',
    shiftChangeAt: hours?.mode === 'always_open' ? hours.shiftChangeAt : DEFAULT_SHIFT,
    opensAt: hours?.mode === 'fixed_hours' ? hours.opensAt : '',
    closesAt: hours?.mode === 'fixed_hours' ? hours.closesAt : '',
    utilities: space?.utilities ?? [],
    customUtilities: space?.customUtilities ?? [],
  };
}

function openingHoursOf(v: FormValues): CreateSpaceInput['openingHours'] {
  return v.mode === 'always_open'
    ? { mode: 'always_open', shiftChangeAt: v.shiftChangeAt }
    : { mode: 'fixed_hours', opensAt: v.opensAt, closesAt: v.closesAt };
}

type Utilities = CreateSpaceInput['utilities'];

function createBody(v: FormValues): CreateSpaceInput {
  return {
    name: v.name.trim(),
    description: v.description.trim(),
    country: v.country,
    city: v.city.trim(),
    area: v.area.trim(),
    streetAddress: v.streetAddress.trim(),
    timeZone: v.timeZone,
    currency: v.currency,
    openingHours: openingHoursOf(v),
    utilities: v.utilities as Utilities,
    customUtilities: v.customUtilities,
  };
}

/** Only what differs from the saved values (`openingHours` whole, as the API replaces it). */
function updateBody(v: FormValues, base: FormValues): UpdateSpaceInput {
  const body: UpdateSpaceInput = {};
  for (const key of TEXT_FIELDS) {
    const next = v[key].trim();
    if (next !== base[key].trim()) body[key] = next;
  }
  const hoursChanged =
    v.mode !== base.mode ||
    (v.mode === 'always_open'
      ? v.shiftChangeAt !== base.shiftChangeAt
      : v.opensAt !== base.opensAt || v.closesAt !== base.closesAt);
  if (hoursChanged) body.openingHours = openingHoursOf(v);
  if (v.utilities.join() !== base.utilities.join()) body.utilities = v.utilities as Utilities;
  if (v.customUtilities.join('\n') !== base.customUtilities.join('\n')) {
    body.customUtilities = v.customUtilities;
  }
  return body;
}

interface FieldProps {
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
function Field({ id, label, hint, error, className, children }: FieldProps) {
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

type Props = { mode: 'create'; space?: undefined } | { mode: 'edit'; space: OwnerSpace };

/**
 * Space details form (ui/02 section 4). Create goes to the dashboard until the space
 * overview (T023) exists; edit sends only the changed fields.
 */
export function SpaceForm(props: Props) {
  const { mode, space } = props;
  const isEdit = mode === 'edit';
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const reference = useReferenceGet();
  const create = useOwnerSpacesCreate();
  const update = useOwnerSpacesUpdate();

  const [baseline, setBaseline] = useState(() => valuesFor(space));
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Focus is set by `focusFirstInvalid` in DOM order; RHF would use registration order.
    shouldFocusError: false,
    defaultValues: baseline,
  });
  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    reset,
    formState: { errors },
  } = form;

  const [problem, setProblem] = useState<ProblemCopy>();
  const [saved, setSaved] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [customDraft, setCustomDraft] = useState('');
  const [customError, setCustomError] = useState<string>();
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLInputElement>(null);
  const zonePicked = useRef(false);

  const v = useWatch({ control }) as FormValues;
  const { mode: hoursMode } = v;
  const customUtilities = v.customUtilities;
  const utilities = v.utilities;

  const pending = create.isPending || update.isPending;
  const countries = reference.data?.data.countries ?? [];
  const country = countries.find((c) => c.code === v.country);
  const zones = offeredTimeZones(countries);
  const suggested = country?.timeZones ?? [];
  const refLoading = reference.isPending;
  const refError = reference.isError;

  useEffect(() => {
    if (problem) alertRef.current?.focus();
  }, [problem]);

  // "Details saved" shows only while the form still equals what was saved (ui/02 2.3).
  const unchanged = JSON.stringify(v) === JSON.stringify(baseline);

  const text = (name: FieldName) => errors[name]?.message;

  const countryField = useController({ control, name: 'country' });
  const zoneField = useController({ control, name: 'timeZone' });
  const currencyField = useController({ control, name: 'currency' });
  const {
    field: { value: modeValue, onChange: modeChange, onBlur: modeBlur, ref: modeRef },
  } = useController({ control, name: 'mode' });

  const loadingOption = <NativeSelectOption value="">Loading…</NativeSelectOption>;
  const selectProps = (disabled: boolean) => ({
    disabled: pending || disabled,
    'aria-busy': refLoading ? true : undefined,
  });

  const applyServerErrors = (error: unknown) => {
    const items =
      error instanceof ApiError && error.status === 400 ? error.problem?.errors : undefined;
    let unmapped = !items?.length;
    for (const item of items ?? []) {
      const field = fieldForPath(item.path);
      if (field) {
        setError(field, {
          type: 'server',
          message: SERVER_MESSAGE[field] ?? 'Check this field and try again.',
        });
      } else {
        unmapped = true;
      }
    }
    if (unmapped) {
      const alert = describeOwnerProblem(error, 'save your space', pathname);
      setProblem(
        items?.length
          ? { title: 'Check the details', description: ['Check the details and try again.'] }
          : alert,
      );
    }
  };

  const [invalidTick, setInvalidTick] = useState(0);
  useEffect(() => {
    if (!invalidTick) return;
    const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    const target =
      first?.getAttribute('role') === 'radiogroup'
        ? first.querySelector<HTMLElement>('[role="radio"]')
        : first;
    target?.focus();
  }, [invalidTick]);

  const onValid = handleSubmit(
    (values) => {
      setProblem(undefined);
      setSaved(false);
      if (!isEdit) {
        create.mutate(
          { data: createBody(values) },
          {
            onSuccess: () => {
              void queryClient.invalidateQueries({ queryKey: getOwnerSpacesListQueryKey() });
              toast.success('Space created');
              // T023 changes this to the new space's overview.
              router.push('/dashboard');
            },
            onError: applyServerErrors,
          },
        );
        return;
      }
      const body = updateBody(values, baseline);
      if (Object.keys(body).length === 0) {
        setSaved(true);
        return;
      }
      update.mutate(
        { spaceId: space.id, data: body },
        {
          onSuccess: (res) => {
            const next = valuesFor(res.data);
            setBaseline(next);
            reset(next);
            setSaved(true);
            void queryClient.invalidateQueries({ queryKey: getOwnerSpacesGetQueryKey(space.id) });
            void queryClient.invalidateQueries({ queryKey: getOwnerSpacesListQueryKey() });
          },
          onError: applyServerErrors,
        },
      );
    },
    () => {
      setInvalidTick((n) => n + 1);
    },
  );

  const setCustom = (next: string[]) => {
    setValue('customUtilities', next, { shouldDirty: true });
    setSaved(false);
  };

  const addCustom = () => {
    const name = customDraft.trim();
    const error = !name
      ? 'Enter a utility name'
      : name.length > 40
        ? 'Use 40 characters or fewer'
        : customUtilities.some((u) => u.toLowerCase() === name.toLowerCase())
          ? 'You already added that'
          : customUtilities.length >= MAX_CUSTOM
            ? `You can add up to ${MAX_CUSTOM} of your own utilities`
            : undefined;
    if (error) {
      setCustomError(error);
      return;
    }
    setCustom([...customUtilities, name]);
    setCustomDraft('');
    setAnnounce(`Added ${name}. ${customUtilities.length + 1} of ${MAX_CUSTOM} own utilities.`);
    customRef.current?.focus();
  };

  const removeCustom = (name: string) => {
    setCustom(customUtilities.filter((u) => u !== name));
    setAnnounce(`Removed ${name}.`);
    customRef.current?.focus();
  };

  const toggleUtility = (code: string, on: boolean) => {
    const order = reference.data?.data.utilities ?? [];
    const next = on ? [...utilities, code] : utilities.filter((u) => u !== code);
    // Reference order keeps the saved array stable, so toggling on and off is not a change.
    setValue(
      'utilities',
      order.filter((u) => next.includes(u)),
      { shouldDirty: true },
    );
    setSaved(false);
  };

  const customErrorText = customError ?? text('customUtilities');
  const customHint = 'For example, Gym. Up to 5, 40 characters each.';
  const customDescribed = [`${fid('custom')}-hint`, customErrorText ? `${fid('custom')}-error` : '']
    .filter(Boolean)
    .join(' ');
  const modeError = text('mode');
  const tile = (value: string) =>
    `flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring ${
      hoursMode === value ? 'border-primary ring-1 ring-primary bg-primary/5' : ''
    }`;
  const inputSize = 'max-sm:h-11';

  return (
    <form ref={formRef} onSubmit={(e) => void onValid(e)} noValidate className="grid gap-6">
      {problem && (
        <Alert variant="destructive" role="alert" ref={alertRef} tabIndex={-1}>
          <AlertTitle>{problem.title}</AlertTitle>
          <AlertDescription>
            {problem.description.map((part) =>
              typeof part === 'string' ? (
                part
              ) : (
                <Link
                  key={part.href}
                  href={part.href as Route}
                  className="underline underline-offset-4"
                >
                  {part.text}
                </Link>
              ),
            )}
          </AlertDescription>
        </Alert>
      )}

      <fieldset disabled={pending} className="grid min-w-0 gap-4 md:grid-cols-2">
        <Field id={fid('name')} label="Name" error={text('name')} className="md:col-span-2">
          {(aria) => (
            <Input {...aria} className={inputSize} autoComplete="off" {...register('name')} />
          )}
        </Field>
        <Field
          id={fid('description')}
          label="Description"
          hint="What renters should know. Up to 2,000 characters."
          error={text('description')}
          className="md:col-span-2"
        >
          {(aria) => <Textarea {...aria} rows={4} {...register('description')} />}
        </Field>

        <div className="grid gap-2">
          <Field id={fid('country')} label="Country" error={text('country')}>
            {(aria) => (
              <NativeSelect
                className="w-full"
                {...aria}
                {...selectProps(refLoading || refError)}
                name={countryField.field.name}
                ref={countryField.field.ref}
                value={countryField.field.value}
                onBlur={countryField.field.onBlur}
                onChange={(e) => {
                  countryField.field.onChange(e);
                  const first = countries.find((c) => c.code === e.target.value)?.timeZones[0];
                  if (first && !zonePicked.current && !isEdit) {
                    setValue('timeZone', first, { shouldValidate: false });
                  }
                }}
              >
                {refLoading ? (
                  loadingOption
                ) : (
                  <>
                    <NativeSelectOption value="">Choose a country</NativeSelectOption>
                    {countries.map((c) => (
                      <NativeSelectOption key={c.code} value={c.code}>
                        {c.name}
                      </NativeSelectOption>
                    ))}
                  </>
                )}
              </NativeSelect>
            )}
          </Field>
          {refError && (
            <p className="text-destructive text-sm">
              We couldn&apos;t load the country list.{' '}
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => void reference.refetch()}
              >
                Try again
              </Button>
            </p>
          )}
        </div>

        <Field
          id={fid('timeZone')}
          label="Time zone"
          error={text('timeZone')}
          hint={
            country && suggested[0]
              ? `Suggested for ${country.name}: ${suggested[0]}.`
              : 'Choose a country first to see suggestions.'
          }
        >
          {(aria) => (
            <NativeSelect
              className="w-full"
              {...aria}
              {...selectProps(refLoading || refError)}
              name={zoneField.field.name}
              ref={zoneField.field.ref}
              value={zoneField.field.value}
              onBlur={zoneField.field.onBlur}
              onChange={(e) => {
                zonePicked.current = true;
                zoneField.field.onChange(e);
              }}
            >
              {refLoading ? (
                loadingOption
              ) : (
                <>
                  <NativeSelectOption value="">Choose a time zone</NativeSelectOption>
                  {country && (
                    <NativeSelectOptGroup label={`Suggested for ${country.name}`}>
                      {suggested.map((z) => (
                        <NativeSelectOption key={z} value={z}>
                          {z}
                        </NativeSelectOption>
                      ))}
                    </NativeSelectOptGroup>
                  )}
                  <NativeSelectOptGroup label="All time zones">
                    {zones
                      .filter((z) => !suggested.includes(z))
                      .map((z) => (
                        <NativeSelectOption key={z} value={z}>
                          {z}
                        </NativeSelectOption>
                      ))}
                  </NativeSelectOptGroup>
                </>
              )}
            </NativeSelect>
          )}
        </Field>

        <Field id={fid('city')} label="City" error={text('city')}>
          {(aria) => (
            <Input
              {...aria}
              className={inputSize}
              autoComplete="address-level2"
              {...register('city')}
            />
          )}
        </Field>
        <Field id={fid('area')} label="Area or locality" error={text('area')}>
          {(aria) => <Input {...aria} className={inputSize} {...register('area')} />}
        </Field>
        <Field
          id={fid('streetAddress')}
          label="Street address"
          error={text('streetAddress')}
          className="md:col-span-2"
        >
          {(aria) => (
            <Input
              {...aria}
              className={inputSize}
              autoComplete="street-address"
              {...register('streetAddress')}
            />
          )}
        </Field>

        <Field
          id={fid('currency')}
          label="Currency"
          error={text('currency')}
          hint={
            <>
              Every price for this space uses this currency.
              {isEdit && (
                <>
                  <br />
                  Changing the currency doesn&apos;t convert your prices. Check Passes and prices
                  afterwards.
                </>
              )}
            </>
          }
        >
          {(aria) => (
            <NativeSelect
              className="w-full"
              {...aria}
              {...selectProps(refLoading || refError)}
              name={currencyField.field.name}
              ref={currencyField.field.ref}
              value={currencyField.field.value}
              onBlur={currencyField.field.onBlur}
              onChange={currencyField.field.onChange}
            >
              {refLoading ? (
                loadingOption
              ) : (
                <>
                  <NativeSelectOption value="">Choose a currency</NativeSelectOption>
                  {(reference.data?.data.currencies ?? []).map((c) => (
                    <NativeSelectOption key={c.code} value={c.code}>
                      {c.code} {c.name}
                    </NativeSelectOption>
                  ))}
                </>
              )}
            </NativeSelect>
          )}
        </Field>
        <div className="hidden md:block" aria-hidden="true" />

        <fieldset className="grid min-w-0 gap-3 md:col-span-2">
          <legend id={fid('mode-legend')} className="text-sm font-medium">
            Opening hours
          </legend>
          {isEdit && (
            <p className="text-muted-foreground text-sm">
              Changing opening hours applies to new bookings only. Existing bookings keep their
              times. Check Passes and prices afterwards.
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
          {hoursMode === 'always_open' && (
            <Field
              id={fid('shift')}
              label="Shift change time"
              error={text('shiftChangeAt')}
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
            </Field>
          )}
          {hoursMode === 'fixed_hours' && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field id={fid('opens')} label="Opens at" error={text('opensAt')}>
                {(aria) => (
                  <Input {...aria} type="time" className={inputSize} {...register('opensAt')} />
                )}
              </Field>
              <Field
                id={fid('closes')}
                label="Closes at"
                error={text('closesAt')}
                hint="Closing time must be after opening time on the same day."
              >
                {(aria) => (
                  <Input {...aria} type="time" className={inputSize} {...register('closesAt')} />
                )}
              </Field>
            </div>
          )}
        </fieldset>

        <fieldset className="grid min-w-0 gap-3 md:col-span-2">
          <legend className="text-sm font-medium">Utilities (optional)</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(reference.data?.data.utilities ?? []).map((code) => (
              <Label
                key={code}
                htmlFor={fid(`u-${code}`)}
                className={`hover:bg-muted/50 has-focus-visible:outline-ring flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 ${
                  utilities.includes(code) ? 'border-primary' : ''
                }`}
              >
                <Checkbox
                  id={fid(`u-${code}`)}
                  checked={utilities.includes(code)}
                  onCheckedChange={(on) => {
                    toggleUtility(code, on === true);
                  }}
                />
                {utilityLabel(code)}
              </Label>
            ))}
          </div>
        </fieldset>

        <fieldset className="grid min-w-0 gap-3 md:col-span-2">
          <legend className="text-sm font-medium">Your own utilities</legend>
          <div className="grid gap-2">
            <Label htmlFor={fid('custom')}>Add your own utility</Label>
            <div className="grid gap-2 sm:flex sm:items-start">
              <Input
                id={fid('custom')}
                ref={customRef}
                value={customDraft}
                className={`${inputSize} sm:max-w-xs`}
                aria-invalid={customErrorText ? true : undefined}
                aria-describedby={customDescribed}
                onChange={(e) => {
                  setCustomDraft(e.target.value);
                  setCustomError(undefined);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustom();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="max-sm:min-h-11 max-sm:w-full"
                onClick={addCustom}
              >
                <PlusIcon aria-hidden="true" />
                Add utility
              </Button>
            </div>
            <p id={`${fid('custom')}-hint`} className="text-muted-foreground text-sm">
              {customHint}
            </p>
            {customErrorText && (
              <p id={`${fid('custom')}-error`} className="text-destructive text-sm">
                {customErrorText}
              </p>
            )}
          </div>
          <ul aria-label="Your own utilities" className="flex flex-wrap gap-2">
            {customUtilities.map((name) => (
              <li
                key={name}
                className="flex items-center gap-1 rounded-lg border py-1 pr-1 pl-3 text-sm break-words"
              >
                {name}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11 sm:size-8"
                  aria-label={`Remove ${name}`}
                  onClick={() => {
                    removeCustom(name);
                  }}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          <span aria-live="polite" className="sr-only">
            {announce}
          </span>
        </fieldset>

        <div className="grid gap-3 sm:flex sm:items-center md:col-span-2">
          <Button
            type="submit"
            className="max-sm:min-h-11 max-sm:w-full"
            aria-busy={pending ? true : undefined}
          >
            {pending && <Loader2Icon aria-hidden="true" className="animate-spin" />}
            {pending
              ? isEdit
                ? 'Saving…'
                : 'Creating…'
              : isEdit
                ? 'Save details'
                : 'Create space'}
          </Button>
          {!isEdit && (
            <Button asChild variant="outline" className="max-sm:min-h-11 max-sm:w-full">
              <Link href="/dashboard">Cancel</Link>
            </Button>
          )}
          {saved && unchanged && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <CircleCheckIcon aria-hidden="true" className="text-success size-4" />
              Details saved
            </p>
          )}
        </div>
      </fieldset>
    </form>
  );
}
