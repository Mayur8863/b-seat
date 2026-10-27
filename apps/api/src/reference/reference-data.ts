import { isValidTimeZone } from '../common/time/zoned-time.js';

export interface Country {
  code: string;
  name: string;
  timeZones: string[];
}
export interface Currency {
  code: string;
  name: string;
}

/*
 * Node's ICU (`Intl.Locale#timeZones`) still reports some pre-rename IANA ids (Asia/Calcutta,
 * Europe/Kiev, ...). We only ever offer canonical ids, so those are renamed here. Ids that are
 * merely links to another zone but are the current id for their country (Europe/Mariehamn)
 * are kept.
 */
const CANONICAL_TIME_ZONE: Readonly<Record<string, string>> = {
  'Africa/Asmera': 'Africa/Asmara',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Coral_Harbour': 'America/Atikokan',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Godthab': 'America/Nuuk',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
};

export function canonicalTimeZone(timeZone: string): string {
  return CANONICAL_TIME_ZONE[timeZone] ?? timeZone;
}

/** Zones suggested for a region, canonical and runtime-valid, in the runtime's (alphabetical) order. */
function timeZonesFor(region: string): string[] {
  // `timeZones` is the long-standing accessor; `getTimeZones()` is not in Node 22.
  // It is missing from the bundled TS lib typings, hence the narrow structural type.
  const locale: Intl.Locale & { timeZones?: string[] } = new Intl.Locale(`en-${region}`);
  const raw = locale.timeZones ?? [];
  return raw.map(canonicalTimeZone).filter(isValidTimeZone);
}

function buildCountries(): Country[] {
  const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  const out: Country[] = [];
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      const timeZones = timeZonesFor(code);
      const name = names.of(code);
      // No zones means not a real country (ZZ, EU, UN, ...); no name means an unassigned code.
      if (name === undefined || timeZones.length === 0) continue;
      out.push({ code, name, timeZones });
    }
  }
  return out.sort((x, y) => x.name.localeCompare(y.name, 'en'));
}

function buildCurrencies(): Currency[] {
  const names = new Intl.DisplayNames(['en'], { type: 'currency', fallback: 'none' });
  return Intl.supportedValuesOf('currency')
    .map((code) => ({ code, name: names.of(code) }))
    .filter((c): c is Currency => c.name !== undefined)
    .sort((x, y) => x.code.localeCompare(y.code, 'en'));
}

export const COUNTRIES: readonly Country[] = buildCountries();
export const CURRENCIES: readonly Currency[] = buildCurrencies();

const COUNTRY_CODES: ReadonlySet<string> = new Set(COUNTRIES.map((c) => c.code));
const CURRENCY_CODES: ReadonlySet<string> = new Set(CURRENCIES.map((c) => c.code));

export function isCountryCode(value: string): boolean {
  return COUNTRY_CODES.has(value);
}

export function isCurrencyCode(value: string): boolean {
  return CURRENCY_CODES.has(value);
}
