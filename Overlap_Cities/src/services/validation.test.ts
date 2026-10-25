import { describe, expect, it } from 'vitest';
import { DataError, parseBoundaries, parseCityIndex } from './validation';

const valid = {
  id: 'paris', name: 'Paris', country: 'France', countryCode: 'FR', region: 'Western Europe',
  lat: 48.85, lon: 2.35, population: 2_100_000, timezone: 'Europe/Paris', rank: 1, aliases: ['Parigi'], climate: null,
};
const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];

describe('validation', () => {
  it('accepts a valid index', () => {
    const cities = parseCityIndex({ cities: [valid, { ...valid, id: 'paris-2', boundaryNote: 'Central districts' }] });
    expect(cities[0]?.name).toBe('Paris');
    expect(cities[0]?.metroPopulation).toBeNull();
    expect(cities[0]?.boundaryNote).toBeNull();
    expect(cities[1]?.boundaryNote).toBe('Central districts');
  });

  it('treats missing or malformed climate as unavailable instead of failing', () => {
    const cities = parseCityIndex({ cities: [valid, { ...valid, id: 'x', climate: { tmax: [1], tmin: [1] } }] });
    expect(cities[1]?.climate).toBeNull();
  });

  it('rejects bad ids, coordinates, notes and duplicates', () => {
    expect(() => parseCityIndex({ cities: [valid, { ...valid, id: '../etc' }] })).toThrow(DataError);
    expect(() => parseCityIndex({ cities: [valid, { ...valid, id: 'x', lat: 200 }] })).toThrow(DataError);
    expect(() => parseCityIndex({ cities: [valid, valid] })).toThrow(DataError);
    expect(() => parseCityIndex({ cities: [valid, { ...valid, id: 'x', boundaryNote: 'x'.repeat(500) }] })).toThrow(DataError);
  });

  it('validates boundary files', () => {
    expect(parseBoundaries({ id: 'paris', city: [[ring]], metro: null }, 'paris').metro).toBeNull();
    expect(() => parseBoundaries({ id: 'tokyo', city: [[ring]] }, 'paris')).toThrow(DataError);
    expect(() => parseBoundaries({ id: 'paris', city: [[[[0, 0], [1, 'x'], [1, 1], [0, 0]]]] }, 'paris')).toThrow(DataError);
    expect(() => parseBoundaries({ id: 'paris', city: [] }, 'paris')).toThrow(DataError);
  });
});
