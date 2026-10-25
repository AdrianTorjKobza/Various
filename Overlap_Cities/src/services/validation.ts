import type { CityBoundaries, CitySummary, Climate, LngLat, MultiPolygon } from '../domain/types';

/**
 * Runtime validation for every JSON document the app loads.
 * Static files can still be tampered with or corrupted, so nothing is trusted by type alone.
 */

export class DataError extends Error {
  override readonly name = 'DataError';
}

export const CITY_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_CITIES = 10_000;
const MAX_VERTICES = 200_000;

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function str(o: Json, key: string, max = 200): string {
  const v = o[key];
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw new DataError(`Invalid "${key}"`);
  return v;
}

function strOrNull(o: Json, key: string, max = 200): string | null {
  const v = o[key];
  return v === null || v === undefined || v === '' ? null : str(o, key, max);
}

function numOrNull(o: Json, key: string, min: number, max: number): number | null {
  const v = o[key];
  if (v === null || v === undefined) return null;
  if (!isFiniteNumber(v) || v < min || v > max) throw new DataError(`Invalid "${key}"`);
  return v;
}

function num(o: Json, key: string, min: number, max: number): number {
  const v = numOrNull(o, key, min, max);
  if (v === null) throw new DataError(`Missing "${key}"`);
  return v;
}

/** Climate is optional extra information: anything malformed is treated as "not available". */
function parseClimate(v: unknown): Climate | null {
  if (!isObject(v)) return null;
  const months = (k: string): number[] | null => {
    const arr = v[k];
    return Array.isArray(arr) && arr.length === 12 && arr.every((t) => isFiniteNumber(t) && t > -90 && t < 70) ? (arr as number[]) : null;
  };
  const tmax = months('tmax');
  const tmin = months('tmin');
  return tmax && tmin ? { tmax, tmin } : null;
}

export function parseCitySummary(v: unknown): CitySummary {
  if (!isObject(v)) throw new DataError('City entry is not an object');
  const id = str(v, 'id', 64);
  if (!CITY_ID_PATTERN.test(id)) throw new DataError(`Invalid city id "${id}"`);
  const countryCode = str(v, 'countryCode', 2);
  if (!/^[A-Z]{2}$/.test(countryCode)) throw new DataError('Invalid countryCode');
  const aliases = Array.isArray(v['aliases'])
    ? v['aliases'].filter((a): a is string => typeof a === 'string' && a.length > 0 && a.length <= 100).slice(0, 50)
    : [];
  const rank = numOrNull(v, 'rank', 1, MAX_CITIES);
  return {
    id,
    name: str(v, 'name', 100),
    country: str(v, 'country', 100),
    countryCode,
    region: str(v, 'region', 100),
    lat: num(v, 'lat', -90, 90),
    lon: num(v, 'lon', -180, 180),
    population: numOrNull(v, 'population', 0, 1e9),
    metroPopulation: numOrNull(v, 'metroPopulation', 0, 1e9),
    timezone: str(v, 'timezone', 64),
    rank: rank === null ? null : Math.round(rank),
    aliases,
    climate: parseClimate(v['climate']),
    boundaryNote: strOrNull(v, 'boundaryNote', 200),
  };
}

export function parseCityIndex(v: unknown): CitySummary[] {
  if (!isObject(v) || !Array.isArray(v['cities'])) throw new DataError('Invalid city index');
  const cities = v['cities'];
  if (cities.length < 2 || cities.length > MAX_CITIES) throw new DataError('City index must contain 2+ cities');
  const parsed = cities.map(parseCitySummary);
  if (new Set(parsed.map((c) => c.id)).size !== parsed.length) throw new DataError('Duplicate city ids');
  return parsed;
}

function parseMultiPolygon(v: unknown, label: string): MultiPolygon {
  let vertices = 0;
  const fail = (): never => {
    throw new DataError(`Invalid ${label} geometry`);
  };
  if (!Array.isArray(v) || v.length === 0) fail();
  const polygons = v as unknown[];
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0) fail();
    for (const ring of polygon as unknown[]) {
      if (!Array.isArray(ring) || ring.length < 4) fail();
      for (const point of ring as unknown[]) {
        vertices += 1;
        if (
          !Array.isArray(point) ||
          point.length !== 2 ||
          !isFiniteNumber(point[0]) ||
          !isFiniteNumber(point[1]) ||
          Math.abs(point[0]) > 540 ||
          Math.abs(point[1]) > 90
        ) {
          fail();
        }
      }
    }
  }
  if (vertices > MAX_VERTICES) throw new DataError(`${label} geometry is too large`);
  return polygons as readonly (readonly (readonly LngLat[])[])[];
}

export function parseBoundaries(v: unknown, expectedId: string): CityBoundaries {
  if (!isObject(v) || v['id'] !== expectedId) throw new DataError(`Boundary file does not match "${expectedId}"`);
  return {
    id: expectedId,
    city: parseMultiPolygon(v['city'], 'city'),
    metro: v['metro'] === null || v['metro'] === undefined ? null : parseMultiPolygon(v['metro'], 'metro'),
  };
}
