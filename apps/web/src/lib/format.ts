/** Standard utility labels, keyed by the `/api/reference` codes (ui/02 2.4). */
const UTILITY_LABELS: Record<string, string> = {
  wifi: 'Wi-Fi',
  air_conditioning: 'Air conditioning',
  power_backup: 'Power backup',
  parking: 'Parking',
  meeting_room: 'Meeting room',
  tea_coffee: 'Tea and coffee',
  printer: 'Printer',
  lockers: 'Lockers',
  security_24h: '24-hour security',
  cafeteria: 'Cafeteria',
  accessible_entrance: 'Accessible entrance',
};

/** An unknown code falls back to the code with underscores as spaces, sentence case. */
export function utilityLabel(code: string): string {
  const known = UTILITY_LABELS[code];
  if (known) return known;
  const text = code.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Exact money display from the API's decimal string; never rounds (ui/02 8.3). */
export function formatMoney({ amount, currency }: { amount: string; currency: string }): string {
  const digits =
    new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
      .maximumFractionDigits ?? 2;
  const cents = amount.split('.')[1] ?? '';
  const hasCents = /[1-9]/.test(cents);
  const min = digits < 2 && hasCents ? 2 : digits;
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    currencyDisplay: 'symbol',
    minimumFractionDigits: min,
    maximumFractionDigits: Math.max(digits, 2),
  }).format(amount as unknown as number);
}

export type PassType = 'day' | 'week' | 'month';
export type SlotKind = 'day' | 'night' | 'full_day' | 'working_hours';

export const PASS_LABELS: Record<PassType, { name: string; length: string }> = {
  day: { name: 'Day pass', length: '1 day' },
  week: { name: 'Weekly pass', length: '7 days' },
  month: { name: 'Monthly pass', length: '30 days' },
};

const SLOT_NAMES: Record<SlotKind, string> = {
  day: 'Day slot',
  night: 'Night slot',
  full_day: '24-hour slot',
  working_hours: 'Working hours',
};

/** "Night slot, 19:00 to 07:00 next day". */
export function slotTitle(slot: {
  slot: SlotKind;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
}): string {
  const next = slot.endsNextDay ? ' next day' : '';
  return `${SLOT_NAMES[slot.slot]}, ${slot.startTime} to ${slot.endTime}${next}`;
}

/** "Save ₹300.00 (17%) compared with day and night passes". */
export function savingText(saving: { amount: string; percent: number }, currency: string): string {
  return `Save ${formatMoney({ amount: saving.amount, currency })} (${saving.percent}%) compared with day and night passes`;
}
