'use client';

import { getListingsSearchQueryKey, useMeGet, useReferenceGet } from '@bseat/api-client';
import { Button } from '@bseat/ui/components/button';
import { Checkbox } from '@bseat/ui/components/checkbox';
import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import { NativeSelect } from '@bseat/ui/components/native-select';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDownIcon, SearchIcon } from 'lucide-react';
import type { Route } from 'next';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { ListingResults } from '@/components/listing-results';
import { LocationCombobox } from '@/components/location-combobox';
import {
  EMPTY_FILTERS,
  type FindFilters,
  SLOT_OPTIONS,
  UTILITY_CODES,
  dateRange,
  filtersToQuery,
  parseFilters,
  startDateError,
} from '@/lib/find-filters';
import { PASS_LABELS, utilityLabel } from '@/lib/format';

const schema = z
  .object({
    country: z.string(),
    city: z.string().max(100),
    area: z.string().max(100),
    startDate: z.string(),
    pass: z.enum(['', 'day', 'week', 'month']),
    slot: z.enum(['', 'day', 'night', 'full_day', 'working_hours']),
    utilities: z.array(z.string()),
  })
  .superRefine((v, ctx) => {
    if (!v.country)
      ctx.addIssue({ code: 'custom', path: ['country'], message: 'Choose a country.' });
    const dateError = startDateError(v.startDate, new Date());
    if (dateError) ctx.addIssue({ code: 'custom', path: ['startDate'], message: dateError });
  });

export function ListingSearchForm() {
  const id = useId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const reference = useReferenceGet();
  const me = useMeGet();
  const [moreOpen, setMoreOpen] = useState(false);
  const urlKey = searchParams.toString();
  const applied = parseFilters(new URLSearchParams(urlKey));
  const hasSearch = applied.country !== '';

  const form = useForm<FindFilters>({
    resolver: zodResolver(schema),
    defaultValues: applied,
  });
  const {
    register,
    control,
    handleSubmit,
    reset,
    setFocus,
    setValue,
    getValues,
    formState: { errors, isDirty },
  } = form;

  // Back/forward navigation and shared links change the URL; the form follows it.
  const lastUrl = useRef(urlKey);
  useEffect(() => {
    if (lastUrl.current === urlKey) return;
    lastUrl.current = urlKey;
    reset(parseFilters(new URLSearchParams(urlKey)));
  }, [urlKey, reset]);

  // Prefill from preferences once, only when the URL has no location and the user typed nothing.
  const prefilled = useRef(false);
  const preferences = me.data?.data.preferences;
  const countries = reference.data?.data.countries;
  // The select has no options while the list loads, so a value from the URL is lost; set it again
  // once the options exist.
  useEffect(() => {
    if (countries) setValue('country', getValues('country'));
  }, [countries, setValue, getValues]);
  const referenceSettled = reference.isSuccess || reference.isError;
  useEffect(() => {
    if (prefilled.current || me.isPending || !referenceSettled) return;
    prefilled.current = true;
    if (urlKey.includes('country=') || isDirty || !preferences) return;
    const stored = preferences.country;
    const country = stored && countries?.some((c) => c.code === stored) ? stored : '';
    if (!country) return;
    const next = {
      ...EMPTY_FILTERS,
      country,
      city: preferences.city ?? '',
      area: preferences.area ?? '',
    };
    reset(next);
    lastUrl.current = filtersToQuery(next);
    router.replace(`/find?${filtersToQuery(next)}` as Route);
  }, [me.isPending, referenceSettled, preferences, countries, urlKey, isDirty, reset, router]);

  const search = (values: FindFilters) => {
    const qs = filtersToQuery(values);
    if (qs === urlKey) {
      // Same search again: refresh instead of doing nothing.
      void queryClient.invalidateQueries({ queryKey: getListingsSearchQueryKey() });
      return;
    }
    router.push(`/find?${qs}` as Route);
  };

  const submit = handleSubmit(search, (errs) => {
    if (errs.country) setFocus('country');
    else if (errs.startDate) {
      setMoreOpen(true);
      setFocus('startDate');
    }
  });

  const watched = useWatch({ control });
  const values: FindFilters = { ...EMPTY_FILTERS, ...watched };
  const moreCount =
    (values.startDate ? 1 : 0) +
    (values.pass ? 1 : 0) +
    (values.slot ? 1 : 0) +
    values.utilities.length;
  const range = dateRange(new Date());
  const countryName = (code: string) => countries?.find((c) => c.code === code)?.name ?? code;

  const fieldError = (name: keyof FindFilters) => {
    const message = errors[name]?.message;
    return message ? (
      <p id={`${id}-${name}-error`} className="text-destructive text-sm">
        {message}
      </p>
    ) : null;
  };
  const describedBy = (name: keyof FindFilters, hint?: string) =>
    [hint, errors[name] ? `${id}-${name}-error` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div className="grid gap-8">
      <form
        role="search"
        aria-label="Find a space"
        noValidate
        onSubmit={(e) => void submit(e)}
        className="grid gap-4"
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid content-start gap-2">
            <Label htmlFor={`${id}-country`}>Country</Label>
            <NativeSelect
              id={`${id}-country`}
              disabled={reference.isPending}
              aria-busy={reference.isPending || undefined}
              aria-invalid={errors.country ? true : undefined}
              aria-describedby={describedBy(
                'country',
                reference.isError ? `${id}-country-load` : undefined,
              )}
              className="w-full"
              {...register('country')}
            >
              {reference.isPending ? (
                <option value="">Loading…</option>
              ) : (
                <>
                  <option value="">Choose a country</option>
                  {(countries ?? []).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </>
              )}
            </NativeSelect>
            {reference.isError && (
              <p id={`${id}-country-load`} className="text-muted-foreground text-sm">
                We couldn&apos;t load the country list.{' '}
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
            )}
            {fieldError('country')}
          </div>
          <Controller
            control={control}
            name="city"
            render={({ field }) => (
              <LocationCombobox
                field="city"
                label="City (optional)"
                country={values.country}
                value={field.value}
                onChange={field.onChange}
                onEnter={() => void submit()}
              />
            )}
          />
          <Controller
            control={control}
            name="area"
            render={({ field }) => (
              <LocationCombobox
                field="area"
                label="Area (optional)"
                country={values.country}
                city={values.city}
                value={field.value}
                onChange={field.onChange}
                onEnter={() => void submit()}
                hint="Suggestions appear after you enter a city."
              />
            )}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          className="justify-self-start md:hidden"
          aria-expanded={moreOpen}
          aria-controls={`${id}-more`}
          onClick={() => {
            setMoreOpen((o) => !o);
          }}
        >
          {moreCount > 0 ? `More filters (${moreCount})` : 'More filters'}
          <ChevronDownIcon aria-hidden="true" className={moreOpen ? 'rotate-180' : undefined} />
        </Button>

        <div id={`${id}-more`} className={`${moreOpen ? 'grid' : 'hidden'} gap-4 md:grid`}>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="grid content-start gap-2">
              <Label htmlFor={`${id}-startDate`}>Start date (optional)</Label>
              <Input
                id={`${id}-startDate`}
                type="date"
                min={range.min}
                max={range.max}
                aria-invalid={errors.startDate ? true : undefined}
                aria-describedby={describedBy('startDate', `${id}-startDate-hint`)}
                {...register('startDate')}
              />
              <p id={`${id}-startDate-hint`} className="text-muted-foreground text-sm">
                Show only spaces with a free seat for the whole pass.
              </p>
              {fieldError('startDate')}
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor={`${id}-pass`}>Pass (optional)</Label>
              <NativeSelect id={`${id}-pass`} className="w-full" {...register('pass')}>
                <option value="">Any pass</option>
                {(Object.keys(PASS_LABELS) as (keyof typeof PASS_LABELS)[]).map((p) => (
                  <option key={p} value={p}>
                    {PASS_LABELS[p].name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid content-start gap-2">
              <Label htmlFor={`${id}-slot`}>Slot (optional)</Label>
              <NativeSelect id={`${id}-slot`} className="w-full" {...register('slot')}>
                <option value="">Any slot</option>
                {SLOT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <fieldset className="grid gap-2" aria-describedby={`${id}-utilities-hint`}>
            <legend className="text-sm leading-none font-medium">Utilities (optional)</legend>
            <p id={`${id}-utilities-hint`} className="text-muted-foreground text-sm">
              Spaces must have all you tick.
            </p>
            <Controller
              control={control}
              name="utilities"
              render={({ field }) => (
                <div className="grid gap-1 md:grid-cols-3">
                  {UTILITY_CODES.map((code) => (
                    <div key={code} className="flex min-h-11 items-center gap-2">
                      <Checkbox
                        id={`${id}-u-${code}`}
                        checked={field.value.includes(code)}
                        onCheckedChange={(on) => {
                          field.onChange(
                            on ? [...field.value, code] : field.value.filter((u) => u !== code),
                          );
                        }}
                      />
                      <Label htmlFor={`${id}-u-${code}`}>{utilityLabel(code)}</Label>
                    </div>
                  ))}
                </div>
              )}
            />
          </fieldset>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit">
            <SearchIcon aria-hidden="true" />
            Search
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              reset(EMPTY_FILTERS);
              lastUrl.current = '';
              router.push('/find');
              // reset() re-registers the fields on the next render, so focus after it.
              setTimeout(() => {
                setFocus('country');
              }, 0);
            }}
          >
            Clear filters
          </Button>
        </div>
      </form>

      {hasSearch ? (
        <ListingResults
          key={urlKey}
          filters={applied}
          countryName={countryName(applied.country)}
          onSearchWholeCountry={() => {
            search({ ...getValues(), ...applied, city: '', area: '' });
          }}
          onClearFilters={() => {
            search({ ...EMPTY_FILTERS, country: applied.country });
          }}
        />
      ) : (
        <StartState />
      )}
    </div>
  );
}

function StartState() {
  return (
    <div className="bg-card text-card-foreground grid justify-items-start gap-2 rounded-xl border p-6">
      <SearchIcon aria-hidden="true" className="text-muted-foreground size-5" />
      <p className="font-medium">Choose a country to see spaces.</p>
      <p className="text-muted-foreground">Add a city or area to narrow the results.</p>
    </div>
  );
}
