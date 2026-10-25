import { CITY_ID_PATTERN } from './validation';

/** Subset of the Web Storage API, so the service can be tested without a browser. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const STORAGE_KEY = 'overlap-cities:last-cities:v1';

/** Remembers the last two selected cities on this device only (no cookies, nothing sent to a server). */
export class PreferencesService {
  constructor(private readonly store: KeyValueStore | null) {}

  loadLastCities(): readonly [string, string] | null {
    try {
      const raw = this.store?.getItem(STORAGE_KEY);
      if (!raw || raw.length > 500) return null;
      const value: unknown = JSON.parse(raw);
      if (
        Array.isArray(value) &&
        value.length === 2 &&
        value.every((id) => typeof id === 'string' && CITY_ID_PATTERN.test(id)) &&
        value[0] !== value[1]
      ) {
        return [value[0] as string, value[1] as string];
      }
    } catch {
      // Corrupt or inaccessible storage is treated as "no preference".
    }
    return null;
  }

  saveLastCities(a: string, b: string): void {
    try {
      this.store?.setItem(STORAGE_KEY, JSON.stringify([a, b]));
    } catch {
      // Storage can be full or disabled (e.g. private browsing); remembering is best-effort.
    }
  }
}

/** Returns localStorage when it is usable, otherwise null. */
export function browserStorage(): KeyValueStore | null {
  try {
    const storage = window.localStorage;
    const probe = '__overlap_cities_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}
