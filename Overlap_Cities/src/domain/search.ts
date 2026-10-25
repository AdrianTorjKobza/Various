import type { CitySummary } from './types';

/** Lower-cases, strips accents and collapses punctuation, so "São Paulo" matches "sao paulo". */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

interface Entry {
  readonly city: CitySummary;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly country: string;
}

/** Top destinations first, then by population. */
const byPopularity = (a: CitySummary, b: CitySummary): number =>
  (a.rank ?? Infinity) - (b.rank ?? Infinity) || (b.population ?? 0) - (a.population ?? 0);

/** In-memory search over city names, GeoNames alternate names and countries (fast for thousands of cities). */
export class CitySearchIndex {
  private readonly entries: readonly Entry[];

  constructor(cities: readonly CitySummary[]) {
    this.entries = [...cities].sort(byPopularity).map((city) => ({
      city,
      name: normalise(city.name),
      aliases: city.aliases.map(normalise).filter(Boolean),
      country: normalise(city.country),
    }));
  }

  search(query: string, limit = 8): CitySummary[] {
    const q = normalise(query);
    if (!q) return this.entries.slice(0, limit).map((e) => e.city);

    const hits: { city: CitySummary; score: number; order: number }[] = [];
    this.entries.forEach((entry, order) => {
      const s = score(entry, q);
      if (s > 0) hits.push({ city: entry.city, score: s, order });
    });
    return hits
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .slice(0, limit)
      .map((r) => r.city);
  }
}

function score(entry: Entry, q: string): number {
  if (entry.name === q) return 100;
  if (entry.name.startsWith(q)) return 80;
  if (entry.aliases.includes(q)) return 70;
  if (entry.aliases.some((a) => a.startsWith(q))) return 60;
  if (hasWordPrefix(entry.name, q) || entry.aliases.some((a) => hasWordPrefix(a, q))) return 50;
  if (q.length >= 3 && (entry.name.includes(q) || entry.aliases.some((a) => a.includes(q)))) return 30;
  if (entry.country.startsWith(q)) return 20;
  return 0;
}

function hasWordPrefix(text: string, q: string): boolean {
  return text.split(' ').some((word) => word.startsWith(q));
}
