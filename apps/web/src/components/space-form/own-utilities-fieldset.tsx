import { Button } from '@bseat/ui/components/button';
import { Input } from '@bseat/ui/components/input';
import { Label } from '@bseat/ui/components/label';
import { PlusIcon, XIcon } from 'lucide-react';
import { useRef, useState } from 'react';

import { MAX_CUSTOM } from '@/lib/space-form-values';

interface Props {
  id: string;
  items: string[];
  /** Server-side error for the list, shown when there is no local draft error. */
  error?: string;
  inputSize: string;
  onChange: (next: string[]) => void;
}

const HINT = 'For example, Gym. Up to 5, 40 characters each.';

/** Free-text utilities the owner adds one by one (ui/02 4.3). */
export function OwnUtilitiesFieldset({ id, items, error, inputSize, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string>();
  const [announce, setAnnounce] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const name = draft.trim();
    const problem = !name
      ? 'Enter a utility name'
      : name.length > 40
        ? 'Use 40 characters or fewer'
        : items.some((u) => u.toLowerCase() === name.toLowerCase())
          ? 'You already added that'
          : items.length >= MAX_CUSTOM
            ? `You can add up to ${MAX_CUSTOM} of your own utilities`
            : undefined;
    if (problem) {
      setDraftError(problem);
      return;
    }
    onChange([...items, name]);
    setDraft('');
    setAnnounce(`Added ${name}. ${items.length + 1} of ${MAX_CUSTOM} own utilities.`);
    inputRef.current?.focus();
  };

  const remove = (name: string) => {
    onChange(items.filter((u) => u !== name));
    setAnnounce(`Removed ${name}.`);
    inputRef.current?.focus();
  };

  const shownError = draftError ?? error;
  const described = [`${id}-hint`, shownError ? `${id}-error` : ''].filter(Boolean).join(' ');

  return (
    <fieldset className="grid min-w-0 gap-3 md:col-span-2">
      <legend className="text-sm font-medium">Your own utilities</legend>
      <div className="grid gap-2">
        {/* The legend is the visible name; this label names the input for assistive tech only. */}
        <Label htmlFor={id} className="sr-only">
          Add your own utility
        </Label>
        <div className="grid gap-2 sm:flex sm:items-start">
          <Input
            id={id}
            ref={inputRef}
            value={draft}
            className={`${inputSize} sm:max-w-xs`}
            aria-invalid={shownError ? true : undefined}
            aria-describedby={described}
            onChange={(e) => {
              setDraft(e.target.value);
              setDraftError(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="max-sm:min-h-11 max-sm:w-full"
            onClick={add}
          >
            <PlusIcon aria-hidden="true" />
            Add utility
          </Button>
        </div>
        <p id={`${id}-hint`} className="text-muted-foreground text-sm">
          {HINT}
        </p>
        {shownError && (
          <p id={`${id}-error`} className="text-destructive text-sm">
            {shownError}
          </p>
        )}
      </div>
      <ul aria-label="Your own utilities" className="flex flex-wrap gap-2">
        {items.map((name) => (
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
                remove(name);
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
  );
}
