import { clamp, normaliseCentre } from '../domain/geo';
import type { CitySummary, LngLat } from '../domain/types';

/** Slot "a" is the base city (blue); "b" is the overlay (orange). */
export type Slot = 'a' | 'b';
export const SLOTS: readonly Slot[] = ['a', 'b'];

export interface SlotState {
  readonly cityId: string;
  /** Where the city's anchor point is currently placed. */
  readonly centre: LngLat;
  readonly rotation: number;
  readonly opacity: number;
}

export interface AppState {
  readonly slots: Readonly<Record<Slot, SlotState>>;
  readonly active: Slot;
  readonly showMetro: boolean;
}

export type CityLookup = (id: string) => CitySummary | undefined;

export const DEFAULT_OPACITY: Readonly<Record<Slot, number>> = { a: 0.25, b: 0.45 };
export const OPACITY_RANGE = { min: 0.1, max: 0.9 } as const;
export const ROTATION_RANGE = { min: -180, max: 180 } as const;

export const anchorOf = (city: CitySummary): LngLat => [city.lon, city.lat];

/** Initial layout: base city at its real location, overlay centred on top of it. */
export function createState(a: CitySummary, b: CitySummary, showMetro = false): AppState {
  const centre = anchorOf(a);
  return {
    slots: {
      a: { cityId: a.id, centre, rotation: 0, opacity: DEFAULT_OPACITY.a },
      b: { cityId: b.id, centre, rotation: 0, opacity: DEFAULT_OPACITY.b },
    },
    active: 'b',
    showMetro,
  };
}

const withSlot = (state: AppState, slot: Slot, patch: Partial<SlotState>): AppState => ({
  ...state,
  slots: { ...state.slots, [slot]: { ...state.slots[slot], ...patch } },
});

export function selectCity(state: AppState, slot: Slot, city: CitySummary): AppState {
  if (state.slots[slot].cityId === city.id) return state;
  if (slot === 'a') {
    const centre = anchorOf(city);
    const next = withSlot(state, 'a', { cityId: city.id, centre, rotation: 0 });
    return withSlot(next, 'b', { centre });
  }
  return withSlot({ ...state, active: 'b' }, 'b', { cityId: city.id, centre: state.slots.a.centre, rotation: 0 });
}

export function moveCity(state: AppState, slot: Slot, centre: LngLat): AppState {
  return withSlot(state, slot, { centre: normaliseCentre(centre) });
}

export function setActive(state: AppState, slot: Slot): AppState {
  return state.active === slot ? state : { ...state, active: slot };
}

export function setRotation(state: AppState, slot: Slot, degrees: number): AppState {
  return withSlot(state, slot, { rotation: clamp(Math.round(degrees), ROTATION_RANGE.min, ROTATION_RANGE.max) });
}

export function setOpacity(state: AppState, slot: Slot, opacity: number): AppState {
  return withSlot(state, slot, { opacity: clamp(opacity, OPACITY_RANGE.min, OPACITY_RANGE.max) });
}

export function setShowMetro(state: AppState, showMetro: boolean): AppState {
  return state.showMetro === showMetro ? state : { ...state, showMetro };
}

/** Puts the base city back on its real location and the overlay back on top of it. */
export function resetPositions(state: AppState, lookup: CityLookup): AppState {
  const base = lookup(state.slots.a.cityId);
  if (!base) return state;
  const centre = anchorOf(base);
  return withSlot(withSlot(state, 'a', { centre }), 'b', { centre });
}

/** The overlay becomes the base city and vice versa. */
export function swap(state: AppState, lookup: CityLookup): AppState {
  const swapped: AppState = {
    ...state,
    active: state.active === 'a' ? 'b' : 'a',
    slots: {
      a: { ...state.slots.b, opacity: state.slots.a.opacity },
      b: { ...state.slots.a, opacity: state.slots.b.opacity },
    },
  };
  return resetPositions(swapped, lookup);
}
