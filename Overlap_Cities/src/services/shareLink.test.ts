import { describe, expect, it } from 'vitest';
import type { CitySummary } from '../domain/types';
import { createState, DEFAULT_OPACITY, moveCity, setRotation, setShowMetro } from '../state/appState';
import { decodeState, encodeState } from './shareLink';

const city = (id: string, lon: number, lat: number): CitySummary => ({
  id, name: id, country: 'X', countryCode: 'XX', region: 'R', lat, lon, population: null, metroPopulation: null,
  timezone: 'UTC', rank: null, aliases: [], climate: null, boundaryNote: null,
});

const known = new Set(['paris', 'tokyo']);
const isKnown = (id: string): boolean => known.has(id);

describe('share links', () => {
  it('round-trips cities, positions, rotation and metro', () => {
    let state = createState(city('paris', 2.35, 48.85), city('tokyo', 139.69, 35.68));
    state = setShowMetro(moveCity(setRotation(state, 'b', 30), 'b', [3, 49]), true);
    const decoded = decodeState(encodeState(state), isKnown, DEFAULT_OPACITY);
    expect(decoded).toMatchObject({ cityIds: ['paris', 'tokyo'], showMetro: true });
    expect(decoded?.slots.b).toMatchObject({ centre: [3, 49], rotation: 30 });
  });

  it('rejects unknown, malformed or duplicate cities', () => {
    expect(decodeState('a=paris&b=london', isKnown, DEFAULT_OPACITY)).toBeNull();
    expect(decodeState('a=paris&b=<script>', isKnown, DEFAULT_OPACITY)).toBeNull();
    expect(decodeState('a=paris&b=paris', isKnown, DEFAULT_OPACITY)).toBeNull();
    expect(decodeState('', isKnown, DEFAULT_OPACITY)).toBeNull();
  });

  it('ignores invalid positions and clamps numbers', () => {
    const decoded = decodeState('a=paris&b=tokyo&pa=999,1&pb=10,20&rb=9999&ob=500', isKnown, DEFAULT_OPACITY);
    expect(decoded?.slots.a).toBeUndefined();
    expect(decoded?.slots.b).toMatchObject({ centre: [20, 10], rotation: 180, opacity: 0.9 });
  });

  it('rejects oversized input', () => {
    expect(decodeState(`a=paris&b=tokyo&x=${'a'.repeat(2000)}`, isKnown, DEFAULT_OPACITY)).toBeNull();
  });
});
