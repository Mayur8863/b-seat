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
