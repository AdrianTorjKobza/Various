const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function formatArea(m2: number): string {
  const km2 = m2 / 1e6;
  return `${km2 >= 100 ? integer.format(km2) : oneDecimal.format(km2)} km²`;
}

export function formatPopulation(value: number | null): string {
  return value === null ? '—' : compact.format(value);
}

export function formatRatio(larger: number, smaller: number): string {
  if (smaller <= 0) return '—';
  const ratio = larger / smaller;
  return `${ratio >= 10 ? integer.format(ratio) : oneDecimal.format(ratio)}×`;
}

export function formatTemperature(celsius: number): string {
  return `${Math.round(celsius)}°C`;
}

/** Current local time in an IANA zone, plus its UTC offset label. */
export function formatLocalTime(timeZone: string, now: Date = new Date()): string {
  try {
    const time = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit' }).format(now);
    const offset =
      new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'shortOffset' })
        .formatToParts(now)
        .find((p) => p.type === 'timeZoneName')?.value ?? '';
    return offset ? `${time} (${offset})` : time;
  } catch {
    return '—';
  }
}

/** Converts an ISO 3166-1 alpha-2 code into its flag emoji. */
export function flagEmoji(countryCode: string): string {
  if (!/^[A-Z]{2}$/.test(countryCode)) return '';
  return String.fromCodePoint(...[...countryCode].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
