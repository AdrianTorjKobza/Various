import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import type { Slot } from '../state/appState';

export const SLOT_COLORS: Readonly<Record<Slot, { fill: string; line: string }>> = {
  a: { fill: '#2563eb', line: '#1d4ed8' },
  b: { fill: '#f97316', line: '#c2410c' },
};

export const sourceId = (slot: Slot): string => `slot-${slot}`;
export const fillLayerId = (slot: Slot): string => `${slot}-city-fill`;
export const metroFillLayerId = (slot: Slot): string => `${slot}-metro-fill`;
export const lineLayerId = (slot: Slot): string => `${slot}-city-line`;
export const metroLineLayerId = (slot: Slot): string => `${slot}-metro-line`;

/** Layers that can be grabbed with the pointer. */
export const hitLayers = (slot: Slot): string[] => [fillLayerId(slot), metroFillLayerId(slot)];

function slotLayers(slot: Slot): LayerSpecification[] {
  const source = sourceId(slot);
  const { fill, line } = SLOT_COLORS[slot];
  const isMetro = ['==', ['get', 'kind'], 'metro'] as const;
  const isCity = ['==', ['get', 'kind'], 'city'] as const;
  return [
    { id: metroFillLayerId(slot), type: 'fill', source, filter: isMetro, paint: { 'fill-color': fill, 'fill-opacity': 0.08 } },
    { id: metroLineLayerId(slot), type: 'line', source, filter: isMetro, paint: { 'line-color': line, 'line-width': 1.5, 'line-dasharray': [2, 2] } },
    { id: fillLayerId(slot), type: 'fill', source, filter: isCity, paint: { 'fill-color': fill, 'fill-opacity': 0.3 } },
    { id: lineLayerId(slot), type: 'line', source, filter: isCity, paint: { 'line-color': line, 'line-width': 2 } },
  ] as LayerSpecification[];
}

/** Shapes on a plain background: no tiles, fonts or icons, so the map needs no third-party servers. */
export function buildStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      [sourceId('a')]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      [sourceId('b')]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef2f7' } }, ...slotLayers('a'), ...slotLayers('b')],
  };
}
