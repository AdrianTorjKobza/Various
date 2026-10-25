import { getJson, type FetchFn } from './http';

export interface CurrentWeather {
  readonly temperatureC: number;
  readonly windKmh: number;
  readonly code: number;
}

interface CacheEntry {
  readonly at: number;
  readonly value: Promise<CurrentWeather>;
}

/** Current conditions from Open-Meteo (free, no API key). Only coordinates are sent. */
export class WeatherService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly fetchFn: FetchFn,
    private readonly baseUrl = 'https://api.open-meteo.com/v1/forecast',
    private readonly ttlMs = 10 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  getCurrent(lat: number, lon: number): Promise<CurrentWeather> {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
    const cached = this.cache.get(key);
    if (cached && this.now() - cached.at < this.ttlMs) return cached.value;

    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lon.toFixed(4),
      current: 'temperature_2m,weather_code,wind_speed_10m',
      wind_speed_unit: 'kmh',
    });
    const value = getJson(this.fetchFn, `${this.baseUrl}?${params.toString()}`, 8_000).then(parseCurrent);
    value.catch(() => this.cache.delete(key));
    this.cache.set(key, { at: this.now(), value });
    return value;
  }
}

function parseCurrent(json: unknown): CurrentWeather {
  const current = (json as { current?: Record<string, unknown> } | null)?.current;
  const t = current?.['temperature_2m'];
  const w = current?.['wind_speed_10m'];
  const c = current?.['weather_code'];
  if (typeof t !== 'number' || typeof w !== 'number' || typeof c !== 'number' || ![t, w, c].every(Number.isFinite)) {
    throw new Error('Unexpected weather response');
  }
  return { temperatureC: t, windKmh: w, code: c };
}
