import type { CityBoundaries, CitySummary } from '../domain/types';
import { getJson, type FetchFn } from './http';
import { CITY_ID_PATTERN, parseBoundaries, parseCityIndex } from './validation';

export interface CityDataSource {
  loadIndex(): Promise<CitySummary[]>;
  loadBoundaries(id: string): Promise<CityBoundaries>;
}

/** Loads the pre-built static city dataset produced by scripts/data/build_data.py. */
export class StaticCityRepository implements CityDataSource {
  private readonly boundaryCache = new Map<string, Promise<CityBoundaries>>();

  constructor(
    private readonly baseUrl: string,
    private readonly fetchFn: FetchFn,
  ) {}

  async loadIndex(): Promise<CitySummary[]> {
    return parseCityIndex(await getJson(this.fetchFn, `${this.baseUrl}cities.json`));
  }

  loadBoundaries(id: string): Promise<CityBoundaries> {
    if (!CITY_ID_PATTERN.test(id)) return Promise.reject(new Error(`Invalid city id "${id}"`));
    let pending = this.boundaryCache.get(id);
    if (!pending) {
      pending = getJson(this.fetchFn, `${this.baseUrl}boundaries/${id}.json`).then((json) => parseBoundaries(json, id));
      pending.catch(() => this.boundaryCache.delete(id)); // allow retry after a failure
      this.boundaryCache.set(id, pending);
    }
    return pending;
  }
}
