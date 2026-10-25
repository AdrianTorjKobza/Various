import { describe, expect, it } from 'vitest';
import { CitySearchIndex, normalise } from './search';
import type { CitySummary } from './types';

const city = (id: string, name: string, rank: number | null, aliases: string[] = [], country = 'Somewhere', population = 1000): CitySummary => ({
  id, name, country, countryCode: 'XX', region: 'Region', lat: 0, lon: 0, population, metroPopulation: null,
  timezone: 'UTC', rank, aliases, climate: null, boundaryNote: null,
});

const index = new CitySearchIndex([
  city('paris', 'Paris', 1, ['Parigi'], 'France'),
  city('sao-paulo', 'São Paulo', 44, ['Sampa'], 'Brazil'),
  city('new-york', 'New York', 6, ['NYC', 'New York City'], 'United States'),
  city('newcastle', 'Newcastle', null),
  city('valencia', 'Valencia', 62, [], 'Spain'),
  city('valencia-ve', 'Valencia', null, [], 'Venezuela', 1_500_000),
]);

describe('search', () => {
  it('normalises accents and punctuation', () => {
    expect(normalise('  São-Paulo! ')).toBe('sao paulo');
  });

  it('matches without accents', () => {
    expect(index.search('sao')[0]?.id).toBe('sao-paulo');
  });

  it('matches GeoNames alternate names', () => {
    expect(index.search('nyc')[0]?.id).toBe('new-york');
    expect(index.search('parigi')[0]?.id).toBe('paris');
  });

  it('ranks prefixes by popularity', () => {
    expect(index.search('new').map((c) => c.id)).toEqual(['new-york', 'newcastle']);
  });

  it('lists namesakes with the top destination first', () => {
    expect(index.search('valencia').map((c) => c.id)).toEqual(['valencia', 'valencia-ve']);
  });

  it('matches countries', () => {
    expect(index.search('fran')[0]?.id).toBe('paris');
  });

  it('returns the most popular cities for an empty query', () => {
    expect(index.search('', 2).map((c) => c.id)).toEqual(['paris', 'new-york']);
  });

  it('returns nothing for unrelated text', () => {
    expect(index.search('zzzz')).toEqual([]);
  });

  it('stays fast with thousands of cities', () => {
    const many = Array.from({ length: 3000 }, (_, i) => city(`c${i}`, `City ${i}`, null, [`Alias ${i}`, `Other ${i}`]));
    const big = new CitySearchIndex(many);
    const start = performance.now();
    for (let i = 0; i < 20; i++) big.search(`city ${i}`);
    expect((performance.now() - start) / 20).toBeLessThan(20);
  });
});
