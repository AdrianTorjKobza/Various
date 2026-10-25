import { describe, expect, it } from 'vitest';
import { PreferencesService, type KeyValueStore } from './preferences';

class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe('preferences', () => {
  it('remembers the last two cities', () => {
    const prefs = new PreferencesService(new MemoryStore());
    prefs.saveLastCities('paris', 'tokyo');
    expect(prefs.loadLastCities()).toEqual(['paris', 'tokyo']);
  });

  it('ignores corrupt or tampered values', () => {
    const store = new MemoryStore();
    const prefs = new PreferencesService(store);
    for (const raw of ['not json', '["paris"]', '["paris","paris"]', '["<img>","tokyo"]', '{"a":1}']) {
      store.data.set('overlap-cities:last-cities:v1', raw);
      expect(prefs.loadLastCities()).toBeNull();
    }
  });

  it('works when storage is unavailable or throws', () => {
    expect(new PreferencesService(null).loadLastCities()).toBeNull();
    const throwing: KeyValueStore = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const prefs = new PreferencesService(throwing);
    expect(() => prefs.saveLastCities('a', 'b')).not.toThrow();
    expect(prefs.loadLastCities()).toBeNull();
  });
});
