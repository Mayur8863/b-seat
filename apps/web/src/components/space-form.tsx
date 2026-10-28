'use client';

import {
  ApiError,
  getOwnerSpacesGetQueryKey,
  getOwnerSpacesListQueryKey,
  type OwnerSpace,
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
import { toast } from '@bseat/ui/components/sonner';
import { Textarea } from '@bseat/ui/components/textarea';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheckIcon, Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { useController, useForm, useWatch } from 'react-hook-form';

import { utilityLabel } from '@/lib/format';
import { describeOwnerProblem } from '@/lib/marketplace-problems';
import { offeredTimeZones } from '@/lib/time-zones';
import type { ProblemCopy } from '@/lib/problem-copy';
import {
  createBody,
  type FieldName,
  fieldForPath,
  type FormOutput,
  type FormValues,
  SERVER_FALLBACK,
  SERVER_MESSAGE,
  schema,
  updateBody,
  valuesFor,
} from '@/lib/space-form-values';

import { FormField } from './space-form/form-field';
import { OpeningHoursFieldset } from './space-form/opening-hours-fieldset';
import { OwnUtilitiesFieldset } from './space-form/own-utilities-fieldset';

type Props = { mode: 'create'; space?: undefined } | { mode: 'edit'; space: OwnerSpace };

/**
 * Space details form (ui/02 section 4). Create opens the new space's overview; edit sends only the changed fields.
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
  const form = useForm<FormValues, unknown, FormOutput>({
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
    clearErrors,
    reset,
    formState: { errors },
  } = form;

  const [problem, setProblem] = useState<ProblemCopy>();
  const [saved, setSaved] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const zonePicked = useRef(false);

  const v = useWatch({ control }) as FormValues;
  const customUtilities = v.customUtilities;
  const utilities = v.utilities;

  const pending = create.isPending || update.isPending;
  // After a created space the page navigates away; keep the form locked so it can't post twice.
  const locked = pending || create.isSuccess;
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

  const loadingOption = <NativeSelectOption value="">Loading…</NativeSelectOption>;
  const selectProps = (disabled: boolean) => ({
    disabled: locked || disabled,
    'aria-busy': refLoading ? true : undefined,
  });

  const applyServerErrors = (error: unknown) => {
    const items =
      error instanceof ApiError && error.status === 400 ? error.problem?.errors : undefined;
    let unmapped = !items?.length;
    let mapped = false;
    for (const item of items ?? []) {
      const field = fieldForPath(item.path);
      if (field) {
        mapped = true;
        setError(field, {
          type: 'server',
          message: SERVER_MESSAGE[field] ?? SERVER_FALLBACK,
        });
      } else {
        unmapped = true;
      }
    }
    if (mapped && !unmapped) setInvalidTick((n) => n + 1);
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
            onSuccess: (res) => {
              void queryClient.invalidateQueries({ queryKey: getOwnerSpacesListQueryKey() });
              toast.success('Space created');
              router.push(`/owner/spaces/${res.data.id}`);
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
    clearErrors('customUtilities');
    setSaved(false);
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
    clearErrors('utilities');
    setSaved(false);
  };

  const utilitiesError = text('utilities');
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
                <Link key={part.href} href={part.href} className="underline underline-offset-4">
                  {part.text}
                </Link>
              ),
            )}
          </AlertDescription>
        </Alert>
      )}

      <fieldset disabled={locked} className="grid min-w-0 items-start gap-4 md:grid-cols-2">
        <FormField id={fid('name')} label="Name" error={text('name')} className="md:col-span-2">
          {(aria) => (
            <Input {...aria} className={inputSize} autoComplete="off" {...register('name')} />
          )}
        </FormField>
        <FormField
          id={fid('description')}
          label="Description"
          hint="What renters should know. Up to 2,000 characters."
          error={text('description')}
          className="md:col-span-2"
        >
          {(aria) => <Textarea {...aria} rows={4} {...register('description')} />}
        </FormField>

        <div className="grid gap-2">
          <FormField id={fid('country')} label="Country" error={text('country')}>
            {(aria) => (
              <NativeSelect
                className="w-full"
                {...aria}
                {...selectProps(refLoading)}
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
          </FormField>
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

        <FormField
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
              {...selectProps(refLoading)}
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
        </FormField>

        <FormField id={fid('city')} label="City" error={text('city')}>
          {(aria) => (
            <Input
              {...aria}
              className={inputSize}
              autoComplete="address-level2"
              {...register('city')}
            />
          )}
        </FormField>
        <FormField id={fid('area')} label="Area or locality" error={text('area')}>
          {(aria) => <Input {...aria} className={inputSize} {...register('area')} />}
        </FormField>
        <FormField
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
        </FormField>

        <FormField
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
              {...selectProps(refLoading)}
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
        </FormField>
        <div className="hidden md:block" aria-hidden="true" />

        <OpeningHoursFieldset form={form} fid={fid} isEdit={isEdit} inputSize={inputSize} />

        <fieldset className="grid min-w-0 gap-3 md:col-span-2">
          <legend className="text-sm font-medium">Utilities (optional)</legend>
          {utilitiesError && (
            <p id={fid('utilities-error')} className="text-destructive text-sm">
              {utilitiesError}
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(reference.data?.data.utilities ?? []).map((code, i) => (
              <Label
                key={code}
                htmlFor={fid(`u-${code}`)}
                className={`hover:bg-muted/50 has-focus-visible:outline-ring flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-3 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 ${
                  utilities.includes(code) ? 'border-primary' : ''
                }`}
              >
                <Checkbox
                  id={fid(`u-${code}`)}
                  aria-invalid={utilitiesError && i === 0 ? true : undefined}
                  aria-describedby={utilitiesError ? fid('utilities-error') : undefined}
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

        <OwnUtilitiesFieldset
          id={fid('custom')}
          items={customUtilities}
          error={text('customUtilities')}
          inputSize={inputSize}
          onChange={setCustom}
        />

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
