import { describe, expect, it } from 'vitest';
import type { CitySummary } from '../domain/types';
import { createState, moveCity, resetPositions, selectCity, setOpacity, setRotation, swap } from './appState';
import { chooseInitialCities } from './initialSelection';

const city = (id: string, lon: number, lat: number, rank: number | null = null): CitySummary => ({
  id, name: id, country: 'X', countryCode: 'XX', region: 'R', lat, lon, population: null, metroPopulation: null,
  timezone: 'UTC', rank, aliases: [], climate: null, boundaryNote: null,
});
const paris = city('paris', 2, 48, 1);
const tokyo = city('tokyo', 139, 35, 3);
const rome = city('rome', 12, 41, 4);
const lookup = (id: string): CitySummary | undefined => [paris, tokyo, rome].find((c) => c.id === id);

describe('app state', () => {
  it('starts with the overlay on top of the base city', () => {
    const s = createState(paris, tokyo);
    expect(s.slots.a.centre).toEqual([2, 48]);
    expect(s.slots.b.centre).toEqual([2, 48]);
  });

  it('allows moving both cities', () => {
    let s = createState(paris, tokyo);
    s = moveCity(moveCity(s, 'a', [5, 50]), 'b', [6, 51]);
    expect(s.slots.a.centre).toEqual([5, 50]);
    expect(s.slots.b.centre).toEqual([6, 51]);
  });

  it('swap makes the overlay the base city', () => {
    const s = swap(setRotation(createState(paris, tokyo), 'b', 20), lookup);
    expect(s.slots.a.cityId).toBe('tokyo');
    expect(s.slots.a.rotation).toBe(20);
    expect(s.slots.a.centre).toEqual([139, 35]);
    expect(s.slots.b.centre).toEqual([139, 35]);
  });

  it('selecting a new base city re-centres the overlay on it', () => {
    expect(selectCity(createState(paris, tokyo), 'a', rome).slots.b.centre).toEqual([12, 41]);
  });

  it('clamps rotation and opacity', () => {
    const s = setOpacity(setRotation(createState(paris, tokyo), 'a', 500), 'a', 5);
    expect(s.slots.a.rotation).toBe(180);
    expect(s.slots.a.opacity).toBe(0.9);
  });

  it('reset puts both cities back', () => {
    expect(resetPositions(moveCity(createState(paris, tokyo), 'b', [50, 0]), lookup).slots.b.centre).toEqual([2, 48]);
  });
});

describe('initial selection', () => {
  const many = [...Array.from({ length: 30 }, (_, i) => city(`c${i}`, 0, 0, i + 1)), ...Array.from({ length: 2000 }, (_, i) => city(`auto${i}`, 0, 0))];

  it('restores remembered cities, including non-top-100 cities', () => {
    expect(chooseInitialCities(many, ['c25', 'auto7']).map((c) => c.id)).toEqual(['c25', 'auto7']);
  });

  it('picks two distinct cities from the top 20 for first-time visitors', () => {
    for (const r of [0, 0.3, 0.5, 0.99999]) {
      const [a, b] = chooseInitialCities(many, null, () => r);
      expect(a.id).not.toBe(b.id);
      expect(a.rank).toBeLessThanOrEqual(20);
      expect(b.rank).toBeLessThanOrEqual(20);
    }
  });

  it('falls back when remembered cities no longer exist', () => {
    const [a, b] = chooseInitialCities(many, ['gone', 'c1'], () => 0);
    expect(a.id).not.toBe(b.id);
  });
});
