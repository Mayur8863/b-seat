import { isValidTimeZone } from '../common/time/zoned-time.js';
import { ISO_COUNTRY_CODES } from './countries.js';
import { type StandardUtility, STANDARD_UTILITIES } from './utilities.js';

export interface Country {
  code: string;
  name: string;
  timeZones: string[];
}
export interface Currency {
  code: string;
  name: string;
}
export interface ReferenceData {
  countries: Country[];
  currencies: Currency[];
  utilities: StandardUtility[];
}

/*
 * Node's ICU (checked 2026-10-27 on Node 22.23, ICU 78.3, CLDR 48) still reports some pre-rename
 * IANA ids (Asia/Calcutta, Europe/Kiev, ...). We only offer current ids, so those are renamed
 * here. Ids that are links but the current id for their country (Europe/Mariehamn) are kept.
 * A Map, so prototype keys such as "__proto__" or "constructor" are never treated as renames.
 */
const CANONICAL_TIME_ZONE: ReadonlyMap<string, string> = new Map([
  ['Africa/Asmera', 'Africa/Asmara'],
  ['America/Buenos_Aires', 'America/Argentina/Buenos_Aires'],
  ['America/Catamarca', 'America/Argentina/Catamarca'],
  ['America/Coral_Harbour', 'America/Atikokan'],
  ['America/Cordoba', 'America/Argentina/Cordoba'],
  ['America/Godthab', 'America/Nuuk'],
  ['America/Indianapolis', 'America/Indiana/Indianapolis'],
  ['America/Jujuy', 'America/Argentina/Jujuy'],
  ['America/Louisville', 'America/Kentucky/Louisville'],
  ['America/Mendoza', 'America/Argentina/Mendoza'],
  ['Asia/Calcutta', 'Asia/Kolkata'],
  ['Asia/Katmandu', 'Asia/Kathmandu'],
  ['Asia/Rangoon', 'Asia/Yangon'],
  ['Asia/Saigon', 'Asia/Ho_Chi_Minh'],
  ['Atlantic/Faeroe', 'Atlantic/Faroe'],
  ['Europe/Kiev', 'Europe/Kyiv'],
  ['Pacific/Enderbury', 'Pacific/Kanton'],
  ['Pacific/Ponape', 'Pacific/Pohnpei'],
  ['Pacific/Truk', 'Pacific/Chuuk'],
]);

/** Zones the IANA merged into others; none appear in ICU 78 but an older runtime might. */
const MERGED_TIME_ZONES: ReadonlySet<string> = new Set([
  'Europe/Uzhgorod',
  'Europe/Zaporozhye',
  'America/Nipigon',
  'America/Thunder_Bay',
  'America/Rainy_River',
  'America/Yellowknife',
  'America/Pangnirtung',
  'Australia/Currie',
  'Asia/Choibalsan',
]);

export function canonicalTimeZone(timeZone: string): string {
  return CANONICAL_TIME_ZONE.get(timeZone) ?? timeZone;
}

/**
 * The default (first) zone for every country that has several. ICU lists zones alphabetically,
 * which would make e.g. America/Adak the US default. Every multi-zone country must have an
 * entry (unit-tested), and the zone must be one of its own.
 */
export const PRIMARY_TIME_ZONE: ReadonlyMap<string, string> = new Map([
  ['AQ', 'Antarctica/McMurdo'],
  ['AR', 'America/Argentina/Buenos_Aires'],
  ['AU', 'Australia/Sydney'],
  ['BR', 'America/Sao_Paulo'],
  ['CA', 'America/Toronto'],
  ['CD', 'Africa/Kinshasa'],
  ['CL', 'America/Santiago'],
  ['CN', 'Asia/Shanghai'],
  ['CY', 'Asia/Nicosia'],
  ['DE', 'Europe/Berlin'],
  ['EC', 'America/Guayaquil'],
  ['ES', 'Europe/Madrid'],
  ['FM', 'Pacific/Pohnpei'],
  ['GL', 'America/Nuuk'],
  ['ID', 'Asia/Jakarta'],
  ['KI', 'Pacific/Tarawa'],
  ['KZ', 'Asia/Almaty'],
  ['MH', 'Pacific/Majuro'],
  ['MN', 'Asia/Ulaanbaatar'],
  ['MX', 'America/Mexico_City'],
  ['MY', 'Asia/Kuala_Lumpur'],
  ['NZ', 'Pacific/Auckland'],
  ['PF', 'Pacific/Tahiti'],
  ['PG', 'Pacific/Port_Moresby'],
  ['PS', 'Asia/Gaza'],
  ['PT', 'Europe/Lisbon'],
  ['RU', 'Europe/Moscow'],
  ['UA', 'Europe/Kyiv'],
  ['UM', 'Pacific/Midway'],
  ['US', 'America/New_York'],
  ['UZ', 'Asia/Tashkent'],
]);

/** Zones suggested for a region: canonical, runtime-valid, deduped, primary zone first. */
function timeZonesFor(region: string): string[] {
  // Node 22 has only the older `timeZones` accessor; newer engines add `getTimeZones()`. Neither
  // is fully in the bundled TS lib typings.
  const locale: Intl.Locale & { getTimeZones?: () => string[]; timeZones?: string[] } =
    new Intl.Locale(`und-${region}`);
  const raw = locale.getTimeZones?.() ?? locale.timeZones ?? [];
  const zones = [
    ...new Set(
      raw.map(canonicalTimeZone).filter((z) => !MERGED_TIME_ZONES.has(z) && isValidTimeZone(z)),
    ),
  ];
  const primary = PRIMARY_TIME_ZONE.get(region);
  if (primary === undefined || !zones.includes(primary)) return zones;
  return [primary, ...zones.filter((z) => z !== primary)];
}

function buildCountries(): Country[] {
  const names = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
  const out: Country[] = [];
  for (const code of ISO_COUNTRY_CODES) {
    const name = names.of(code);
    if (name !== undefined) out.push({ code, name, timeZones: timeZonesFor(code) });
  }
  // A runtime without full ICU would silently ship a short list; refuse to start instead.
  if (out.length < 240)
    throw new Error(`Only ${out.length} countries have names; ICU data missing`);
  return out.sort((x, y) => x.name.localeCompare(y.name, 'en'));
}

/*
 * Currencies that `Intl.supportedValuesOf('currency')` lists but that are not current legal
 * tender: IMF/test/metal codes and recently superseded currencies (ANG by XCG in 2025, BGN by EUR
 * on 2026-01-01). Real tender XAF, XOF, XCD, XPF (and XCG, ZWG, SLE) stay.
 */
const NON_TENDER_CURRENCIES: ReadonlySet<string> = new Set([
  'XDR',
  'XSU',
  'XUA',
  'XBA',
  'XBB',
  'XBC',
  'XBD',
  'XTS',
  'XXX',
  'XAU',
  'XAG',
  'XPD',
  'XPT',
  'HRK',
  'SLL',
  'CUC',
  'ZWL',
  'ANG',
  'BGN',
]);

function buildCurrencies(): Currency[] {
  const names = new Intl.DisplayNames(['en'], { type: 'currency', fallback: 'none' });
  return Intl.supportedValuesOf('currency')
    .filter((code) => !NON_TENDER_CURRENCIES.has(code))
    .map((code) => ({ code, name: names.of(code) }))
    .filter((c): c is Currency => c.name !== undefined)
    .sort((x, y) => x.code.localeCompare(y.code, 'en'));
}

export const COUNTRIES: readonly Country[] = buildCountries();
export const CURRENCIES: readonly Currency[] = buildCurrencies();

const COUNTRY_CODES: ReadonlySet<string> = new Set(COUNTRIES.map((c) => c.code));
const CURRENCY_CODES: ReadonlySet<string> = new Set(CURRENCIES.map((c) => c.code));
const OFFERED_TIME_ZONES: ReadonlySet<string> = new Set([
  'UTC',
  ...COUNTRIES.flatMap((c) => c.timeZones),
]);

export function isCountryCode(value: string): boolean {
  return COUNTRY_CODES.has(value);
}

export function isCurrencyCode(value: string): boolean {
  return CURRENCY_CODES.has(value);
}

/** Allow-list for stored space time zones: every suggested zone plus UTC. Pair with `.max(64)`. */
export function isOfferedTimeZone(value: string): boolean {
  return OFFERED_TIME_ZONES.has(value);
}

function freezeDeep<T extends object>(value: T): T {
  for (const v of Object.values(value)) {
    if (typeof v === 'object' && v !== null) freezeDeep(v);
  }
  return Object.freeze(value);
}

/** The `GET /api/reference` payload, built once and immutable. */
export const REFERENCE: ReferenceData = freezeDeep({
  countries: COUNTRIES.map((c) => ({ ...c, timeZones: [...c.timeZones] })),
  currencies: CURRENCIES.map((c) => ({ ...c })),
  utilities: [...STANDARD_UTILITIES],
});
