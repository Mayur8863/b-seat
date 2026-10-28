export interface CountryZones {
  code: string;
  name: string;
  timeZones: string[];
}

/**
 * The time zones the API accepts (`OfferedTimeZone`): every country's zones plus UTC, sorted.
 * Never `Intl.supportedValuesOf('timeZone')`: browsers still list ids such as `Asia/Calcutta`
 * that the API refuses (OQ-B).
 */
export function offeredTimeZones(countries: readonly CountryZones[]): string[] {
  return [...new Set([...countries.flatMap((c) => c.timeZones), 'UTC'])].sort();
}
