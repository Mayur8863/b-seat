'use client';

import { useListingsLocations } from '@bseat/api-client';
import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import { cn } from '@bseat/ui/lib/utils';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

interface Props {
  field: 'city' | 'area';
  label: string;
  country: string;
  /** Required for `area` suggestions. */
  city?: string;
  value: string;
  onChange: (value: string) => void;
  /** Enter with no active option: the form submits. */
  onEnter: () => void;
  hint?: string;
  error?: string;
  debounceMs?: number;
}

/** ARIA 1.2 editable combobox with list autocomplete (ui/03 3.3). The text stays free. */
export function LocationCombobox({
  field,
  label,
  country,
  city = '',
  value,
  onChange,
  onEnter,
  hint,
  error,
  debounceMs = 250,
}: Props) {
  const id = useId();
  const listId = `${id}-listbox`;
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(value.trim());
    }, debounceMs);
    return () => {
      clearTimeout(t);
    };
  }, [value, debounceMs]);

  const q = debounced.slice(0, 100);
  const enabled = Boolean(country) && q.length > 0 && (field === 'city' || city.trim() !== '');
  const { data, isFetching } = useListingsLocations(
    {
      country,
      field,
      q,
      ...(field === 'area' ? { city: city.trim() } : {}),
    },
    { query: { enabled, retry: false } },
  );
  const items = enabled ? (data?.data.items ?? []) : [];
  const showList = open && items.length > 0;

  // Derived from the result set, so it changes only when the options do, not on every keystroke.
  const count = enabled && data ? items.length : null;
  const announced =
    count === null
      ? ''
      : count === 0
        ? 'No suggestions.'
        : count === 1
          ? '1 suggestion available.'
          : `${count} suggestions available. Use the up and down keys.`;

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setActive(-1);
  };

  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : '']
    .filter(Boolean)
    .join(' ');
  const title = field === 'city' ? 'City' : 'Area';

  return (
    <div className="relative grid content-start gap-2">
      <Label htmlFor={`${id}-input`}>{label}</Label>
      <div className="relative">
        <Input
          id={`${id}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : ''}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          maxLength={100}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onBlur={() => {
            setOpen(false);
            setActive(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              if (items.length === 0) return;
              e.preventDefault();
              setOpen(true);
              setActive((a) =>
                e.key === 'ArrowDown' ? (a + 1) % items.length : a <= 0 ? items.length - 1 : a - 1,
              );
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const chosen = showList ? items[active] : undefined;
              if (chosen) pick(chosen.value);
              else onEnter();
            } else if (e.key === 'Escape' && showList) {
              e.preventDefault();
              setOpen(false);
              setActive(-1);
            }
          }}
        />
        {isFetching && (
          <Loader2Icon
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin"
          />
        )}
        {showList && (
          <div
            id={listId}
            role="listbox"
            aria-label={`${title} suggestions`}
            className="bg-popover text-popover-foreground absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border shadow-md"
          >
            {items.map((item, n) => (
              <div
                key={item.value}
                id={`${id}-opt-${n}`}
                role="option"
                tabIndex={-1}
                aria-selected={n === active}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-between gap-2 px-3 py-2',
                  n === active &&
                    'bg-accent text-accent-foreground outline-ring outline-2 -outline-offset-2',
                )}
                onMouseEnter={() => {
                  setActive(n);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(item.value);
                }}
              >
                <span>{item.value}</span>
                <span className="text-muted-foreground text-sm">
                  {item.count === 1 ? '1 space' : `${item.count} spaces`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {announced}
      </span>
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
