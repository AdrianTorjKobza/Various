import type { CitySummary } from '../domain/types';

export const TOP_N = 20;

/**
 * Returning visitors get their last two cities back; first-time visitors get two random,
 * distinct cities from the top-N most visited (falling back to the whole list if needed).
 */
export function chooseInitialCities(
  cities: readonly CitySummary[],
  remembered: readonly [string, string] | null,
  random: () => number = Math.random,
): [CitySummary, CitySummary] {
  if (remembered) {
    const a = cities.find((c) => c.id === remembered[0]);
    const b = cities.find((c) => c.id === remembered[1]);
    if (a && b && a.id !== b.id) return [a, b];
  }
  const top = cities.filter((c) => c.rank !== null && c.rank <= TOP_N);
  const pool = top.length >= 2 ? top : cities;
  if (pool.length < 2) throw new Error('At least two cities are required');
  const first = Math.min(Math.floor(random() * pool.length), pool.length - 1);
  let second = Math.min(Math.floor(random() * (pool.length - 1)), pool.length - 2);
  if (second >= first) second += 1;
  return [pool[first]!, pool[second]!];
}
