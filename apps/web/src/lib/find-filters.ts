import type { ListingsSearchParams } from '@bseat/api-client';

import { PASS_LABELS, type PassType, type SlotKind, utilityLabel } from '@/lib/format';

export interface FindFilters {
  country: string;
  city: string;
  area: string;
  startDate: string;
  pass: PassType | '';
  slot: SlotKind | '';
  utilities: string[];
}

export const EMPTY_FILTERS: FindFilters = {
  country: '',
  city: '',
  area: '',
  startDate: '',
  pass: '',
  slot: '',
  utilities: [],
};

export const SLOT_OPTIONS: { value: SlotKind; label: string }[] = [
  { value: 'day', label: 'Day slot' },
  { value: 'night', label: 'Night slot' },
  { value: 'full_day', label: '24-hour slot' },
  { value: 'working_hours', label: 'Working hours' },
];

const PASSES = Object.keys(PASS_LABELS) as PassType[];
const SLOTS = SLOT_OPTIONS.map((s) => s.value);

function oneOf<T extends string>(value: string | null, allowed: readonly T[]): T | '' {
  return allowed.find((a) => a === value) ?? '';
}

/** Standard utility codes the API accepts; anything else in the URL is ignored. */
export const UTILITY_CODES = [
  'wifi',
  'air_conditioning',
  'power_backup',
  'parking',
  'meeting_room',
  'tea_coffee',
  'printer',
  'lockers',
  'security_24h',
  'cafeteria',
  'accessible_entrance',
] as const;
type UtilityCode = (typeof UTILITY_CODES)[number];

export function parseFilters(params: URLSearchParams): FindFilters {
  return {
    country: (params.get('country') ?? '').trim(),
    city: (params.get('city') ?? '').trim(),
    area: (params.get('area') ?? '').trim(),
    startDate: params.get('startDate') ?? '',
    pass: oneOf(params.get('pass'), PASSES),
    slot: oneOf(params.get('slot'), SLOTS),
    utilities: UTILITY_CODES.filter((u) => params.getAll('utilities').includes(u)),
  };
}

export function filtersToQuery(f: FindFilters): string {
  const q = new URLSearchParams();
  const set = (key: string, value: string) => {
    if (value.trim()) q.set(key, value.trim());
  };
  set('country', f.country);
  set('city', f.city);
  set('area', f.area);
  set('startDate', f.startDate);
  set('pass', f.pass);
  set('slot', f.slot);
  for (const u of f.utilities) q.append('utilities', u);
  return q.toString();
}

/** `utilities` is typed as `code | code[]`; an array is always valid and repeats the key. */
export function filtersToApiParams(f: FindFilters, cursor?: string): ListingsSearchParams {
  const params: ListingsSearchParams = { country: f.country };
  if (f.city) params.city = f.city;
  if (f.area) params.area = f.area;
  if (f.startDate) params.startDate = f.startDate;
  if (f.pass) params.pass = f.pass;
  if (f.slot) params.slot = f.slot;
  const utilities = f.utilities.filter((u): u is UtilityCode => UTILITY_CODES.some((c) => c === u));
  if (utilities.length > 0) params.utilities = utilities;
  if (cursor) params.cursor = cursor;
  return params;
}

export function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dateRange(today: Date): { min: string; max: string } {
  const max = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
  return { min: localDate(today), max: localDate(max) };
}

function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function startDateError(value: string, today: Date): string | undefined {
  if (!value) return undefined;
  const { min, max } = dateRange(today);
  if (value >= min && value <= max) return undefined;
  return `Choose a date from ${shortDate(min)} to ${shortDate(max)}.`;
}

/** "Pass: Weekly pass · Slot: Day slot · Starting Tue 3 Nov 2026 · With Wi-Fi, Parking". */
export function describeFilters(f: FindFilters): string {
  const parts: string[] = [];
  if (f.pass) parts.push(`Pass: ${PASS_LABELS[f.pass].name}`);
  if (f.slot) parts.push(`Slot: ${SLOT_OPTIONS.find((s) => s.value === f.slot)?.label ?? f.slot}`);
  if (f.startDate) {
    const [y, m, d] = f.startDate.split('-').map(Number);
    const text = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1)).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
    parts.push(`Starting ${text.replace(',', '')}`);
  }
  if (f.utilities.length > 0) parts.push(`With ${f.utilities.map(utilityLabel).join(', ')}`);
  return parts.join(' · ');
}
