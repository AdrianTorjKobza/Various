import { clamp, normaliseCentre } from '../domain/geo';
import type { LngLat } from '../domain/types';
import { OPACITY_RANGE, ROTATION_RANGE, SLOTS, type AppState, type SlotState } from '../state/appState';
import { CITY_ID_PATTERN } from './validation';

/**
 * Serialises the comparison into URL query parameters and back.
 *   a, b    city ids               pa, pb  centre "lat,lng"
 *   ra, rb  rotation (degrees)     oa, ob  opacity (10–90)
 *   m       metro area (1/0)
 * Every value is validated on the way in; unknown or malformed values are ignored.
 */

export function encodeState(state: AppState): string {
  const params = new URLSearchParams();
  for (const slot of SLOTS) {
    const s = state.slots[slot];
    params.set(slot, s.cityId);
    params.set(`p${slot}`, `${s.centre[1].toFixed(5)},${s.centre[0].toFixed(5)}`);
    if (s.rotation !== 0) params.set(`r${slot}`, String(s.rotation));
    params.set(`o${slot}`, String(Math.round(s.opacity * 100)));
  }
  if (state.showMetro) params.set('m', '1');
  return params.toString();
}

export interface SharedState {
  readonly cityIds: readonly [string, string];
  /** Present only when every positional value was valid. */
  readonly slots: Partial<Record<'a' | 'b', Omit<SlotState, 'cityId'>>>;
  readonly showMetro: boolean;
}

function parseCentre(raw: string | null): LngLat | null {
  if (!raw || raw.length > 40) return null;
  const parts = raw.split(',');
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return normaliseCentre([lng, lat]);
}

function parseNumber(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw === null || raw.length > 10) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
}

export function decodeState(search: string, isKnownCity: (id: string) => boolean, defaultOpacity: Record<'a' | 'b', number>): SharedState | null {
  if (search.length > 1_000) return null;
  const params = new URLSearchParams(search);
  const a = params.get('a');
  const b = params.get('b');
  const valid = (id: string | null): id is string => id !== null && CITY_ID_PATTERN.test(id) && isKnownCity(id);
  if (!valid(a) || !valid(b) || a === b) return null;

  const slots: SharedState['slots'] = {};
  for (const slot of SLOTS) {
    const centre = parseCentre(params.get(`p${slot}`));
    if (!centre) continue;
    slots[slot] = {
      centre,
      rotation: Math.round(parseNumber(params.get(`r${slot}`), ROTATION_RANGE.min, ROTATION_RANGE.max, 0)),
      opacity: parseNumber(params.get(`o${slot}`), OPACITY_RANGE.min * 100, OPACITY_RANGE.max * 100, defaultOpacity[slot] * 100) / 100,
    };
  }
  return { cityIds: [a, b], slots, showMetro: params.get('m') === '1' };
}
