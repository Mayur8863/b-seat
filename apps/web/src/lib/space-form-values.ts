import type {
  CreateSpaceInput,
  CreateSpaceInputUtilitiesItem,
  OwnerSpace,
  UpdateSpaceInput,
} from '@bseat/api-client';
import { z } from 'zod';

export type Utility = CreateSpaceInputUtilitiesItem;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const MAX_CUSTOM = 5;
export const DEFAULT_SHIFT = '07:00';

/*
 * Mirrors PlainText / MultilineText in apps/api/src/common/schemas/field-formats.ts: no
 * control characters, no invisible format characters (\p{Cf}, which covers the bidi overrides
 * and isolates) and no U+2028/2029, except ZWNJ, ZWJ and emoji tag characters (U+E0020-E007F).
 */
const HIDDEN = '\\p{Cc}\\p{Cf}\\u2028\\u2029';
const ALLOWED = '\\u200C|\\u200D|[\\u{E0020}-\\u{E007F}]';
const SINGLE_LINE = new RegExp(`^(?:[^${HIDDEN}]|${ALLOWED})*$`, 'u');
const MULTI_LINE = new RegExp(`^(?:[^${HIDDEN}]|${ALLOWED}|\\n)*$`, 'u');
export const CHARACTER_MESSAGE = 'Remove tabs and hidden formatting characters.';

/** The API turns CRLF into LF and a tab into a space before validating the description. */
export const normalizeDescription = (s: string) => s.replace(/\r\n/g, '\n').replace(/\t/g, ' ');

export const isPlainText = (s: string) => SINGLE_LINE.test(s);

const required = (max: number, empty: string) =>
  z
    .string()
    .trim()
    .min(1, empty)
    .max(max, `Use ${max} characters or fewer`)
    .refine(isPlainText, CHARACTER_MESSAGE);

export const schema = z
  .object({
    name: required(100, 'Enter a name'),
    description: z
      .string()
      .transform(normalizeDescription)
      .pipe(
        z
          .string()
          .trim()
          .min(1, 'Enter a description')
          .max(2000, 'Use 2,000 characters or fewer')
          .refine((s) => MULTI_LINE.test(s), CHARACTER_MESSAGE),
      ),
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
    utilities: z.array(z.custom<Utility>()),
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

/** Form state: the schema's input side (the description is normalised on the way out). */
export type FormValues = z.input<typeof schema>;
export type FieldName = keyof FormValues;

export const TEXT_FIELDS = [
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
export function fieldForPath(path: string): FieldName | undefined {
  const [head, tail] = path.split('.');
  if (head === 'openingHours') {
    if (tail === 'shiftChangeAt' || tail === 'opensAt' || tail === 'closesAt') return tail;
    return 'mode';
  }
  if (head === 'utilities' || head === 'customUtilities') return head;
  return TEXT_FIELDS.find((f) => f === head);
}

export const SERVER_MESSAGE: Partial<Record<FieldName, string>> = {
  timeZone: "That time zone isn't supported. Choose one from the list.",
};

export const SERVER_FALLBACK = 'Check this field and try again.';

export function valuesFor(space?: OwnerSpace): FormValues {
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

const clean = (key: (typeof TEXT_FIELDS)[number], value: string) =>
  (key === 'description' ? normalizeDescription(value) : value).trim();

export function createBody(v: FormValues): CreateSpaceInput {
  return {
    name: clean('name', v.name),
    description: clean('description', v.description),
    country: v.country,
    city: clean('city', v.city),
    area: clean('area', v.area),
    streetAddress: clean('streetAddress', v.streetAddress),
    timeZone: v.timeZone,
    currency: v.currency,
    openingHours: openingHoursOf(v),
    utilities: v.utilities,
    customUtilities: v.customUtilities,
  };
}

/** Only what differs from the saved values (`openingHours` whole, as the API replaces it). */
export function updateBody(v: FormValues, base: FormValues): UpdateSpaceInput {
  const body: UpdateSpaceInput = {};
  for (const key of TEXT_FIELDS) {
    const next = clean(key, v[key]);
    if (next !== clean(key, base[key])) body[key] = next;
  }
  const hoursChanged =
    v.mode !== base.mode ||
    (v.mode === 'always_open'
      ? v.shiftChangeAt !== base.shiftChangeAt
      : v.opensAt !== base.opensAt || v.closesAt !== base.closesAt);
  if (hoursChanged) body.openingHours = openingHoursOf(v);
  if (v.utilities.join() !== base.utilities.join()) body.utilities = v.utilities;
  if (v.customUtilities.join('\n') !== base.customUtilities.join('\n')) {
    body.customUtilities = v.customUtilities;
  }
  return body;
}
