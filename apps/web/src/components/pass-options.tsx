'use client';

import type { Listing } from '@bseat/api-client';
import { RadioGroup, RadioGroupItem } from '@bseat/ui/components/radio-group';
import { PercentIcon } from 'lucide-react';

import {
  formatMoney,
  PASS_LABELS,
  type PassType,
  savingText,
  type SlotKind,
  slotTitle,
} from '@/lib/format';

export interface PassChoice {
  pass: PassType;
  slot: SlotKind;
}

const PASSES: readonly PassType[] = ['day', 'week', 'month'];

export const choiceKey = (c: PassChoice) => `${c.slot}:${c.pass}`;

/** Pass and slot tiles (ui/03 4.2). Selection is controlled so the seat list (T040) can read it. */
export function PassOptions({
  listing,
  value,
  onChange,
}: {
  listing: Pick<Listing, 'offers' | 'fullDaySavings' | 'currency'>;
  value: PassChoice | null;
  onChange: (choice: PassChoice) => void;
}) {
  return (
    <section aria-labelledby="pass-heading" className="grid gap-3">
      <h2 id="pass-heading" className="text-lg font-medium">
        Choose a pass
      </h2>
      <RadioGroup
        aria-labelledby="pass-heading"
        value={value ? choiceKey(value) : ''}
        onValueChange={(key) => {
          const [slot, pass] = key.split(':') as [SlotKind, PassType];
          onChange({ slot, pass });
        }}
        className="gap-5"
      >
        {listing.offers.map((offer) => {
          const title = slotTitle(offer);
          const headingId = `slot-${offer.slot}`;
          return (
            <div key={offer.slot} role="group" aria-labelledby={headingId} className="grid gap-2">
              <h3 id={headingId} className="font-medium">
                {title}
              </h3>
              <div className="grid gap-3 sm:grid-cols-3">
                {PASSES.flatMap((pass) => {
                  const amount = offer.prices[pass];
                  if (amount === null) return [];
                  const price = formatMoney({ amount, currency: listing.currency });
                  const saving = offer.slot === 'full_day' ? listing.fullDaySavings?.[pass] : null;
                  const id = `pass-${offer.slot}-${pass}`;
                  return [
                    <label
                      key={pass}
                      htmlFor={id}
                      className="has-[:focus-visible]:ring-ring/50 has-data-[state=checked]:border-primary bg-card flex cursor-pointer gap-3 rounded-lg border p-4 has-[:focus-visible]:ring-3 max-sm:min-h-11"
                    >
                      <RadioGroupItem
                        id={id}
                        value={choiceKey({ slot: offer.slot, pass })}
                        aria-label={`${PASS_LABELS[pass].name}, ${title}, ${price}`}
                        className="mt-1"
                      />
                      <span className="grid gap-1">
                        <span className="font-medium">{PASS_LABELS[pass].name}</span>
                        <span className="text-muted-foreground text-sm">
                          {PASS_LABELS[pass].length}
                        </span>
                        <span className="font-medium">{price}</span>
                        {saving && (
                          <span className="text-success flex items-start gap-1 text-sm">
                            <PercentIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                            {savingText(saving, listing.currency)}
                          </span>
                        )}
                      </span>
                    </label>,
                  ];
                })}
              </div>
            </div>
          );
        })}
      </RadioGroup>
    </section>
  );
}
