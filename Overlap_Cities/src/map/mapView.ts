import type { Feature, MultiPolygon as GeoJsonMultiPolygon, Position } from 'geojson';
import { Map as MapLibreMap, NavigationControl, ScaleControl } from 'maplibre-gl';
import type { GeoJSONSource, MapMouseEvent, MapTouchEvent, PointLike } from 'maplibre-gl';
import { boundsOf, placeShape, translate } from '../domain/geo';
import type { CityShapes, LngLat, MultiPolygon } from '../domain/types';
import { SLOTS, type Slot } from '../state/appState';
import { buildStyle, fillLayerId, hitLayers, lineLayerId, metroFillLayerId, metroLineLayerId, sourceId } from './mapStyle';

export interface RenderSlot {
  readonly shapes: CityShapes;
  readonly centre: LngLat;
  readonly rotation: number;
  readonly opacity: number;
}

export interface RenderModel {
  readonly slots: Partial<Record<Slot, RenderSlot>>;
  readonly active: Slot;
  readonly showMetro: boolean;
}

/** Callbacks the map raises; the map never mutates application state itself. */
export interface MapViewEvents {
  onPick(slot: Slot): void;
  onMove(slot: Slot, centre: LngLat): void;
  onMoveEnd(slot: Slot): void;
}

export interface Padding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** What the application needs from a map; lets the app be tested or re-hosted without MapLibre. */
export interface MapRenderer {
  render(model: RenderModel): void;
  fitToCities(padding: Padding, animate?: boolean): void;
  resize(): void;
}

interface DragState {
  readonly slot: Slot;
  readonly start: LngLat;
  readonly centre: LngLat;
}

const TOUCH_TOLERANCE_PX = 8;

/** Renders the two cities with MapLibre and turns pointer gestures on them into move events. */
export class MapView implements MapRenderer {
  private readonly map: MapLibreMap;
  private readonly loaded: Promise<void>;
  private model: RenderModel | null = null;
  private placed: Partial<Record<Slot, readonly MultiPolygon[]>> = {};
  private drag: DragState | null = null;
  private frame = 0;

  constructor(
    container: HTMLElement,
    private readonly events: MapViewEvents,
  ) {
    this.map = new MapLibreMap({
      container,
      style: buildStyle(),
      center: [0, 20],
      zoom: 2,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxPitch: 0,
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    this.map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');
    this.loaded = new Promise((resolve) => this.map.once('load', () => resolve()));
    void this.loaded.then(() => this.draw());
    this.bindPointerEvents();
  }

  /** Schedules a redraw; repeated calls within one frame are coalesced. */
  render(model: RenderModel): void {
    this.model = model;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  fitToCities(padding: Padding, animate = true): void {
    void this.loaded.then(() => {
      if (this.frame) {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.draw();
      }
      const bounds = boundsOf(Object.values(this.placed).flat());
      if (!bounds) return;
      this.map.fitBounds([bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]], {
        padding,
        maxZoom: 14,
        duration: animate ? 600 : 0,
      });
    });
  }

  resize(): void {
    this.map.resize();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.map.remove();
  }

  private draw(): void {
    const model = this.model;
    if (!model || !this.map.isStyleLoaded()) return;
    this.placed = {};
    for (const slot of SLOTS) {
      const source = this.map.getSource<GeoJSONSource>(sourceId(slot));
      const entry = model.slots[slot];
      if (!source) continue;
      if (!entry) {
        source.setData({ type: 'FeatureCollection', features: [] });
        continue;
      }
      const city = placeShape(entry.shapes.city, entry.centre, entry.rotation);
      const metro = model.showMetro && entry.shapes.metro ? placeShape(entry.shapes.metro, entry.centre, entry.rotation) : null;
      this.placed[slot] = metro ? [city, metro] : [city];
      source.setData({
        type: 'FeatureCollection',
        features: [...(metro ? [feature('metro', metro)] : []), feature('city', city)],
      });
      const active = model.active === slot;
      this.map.setPaintProperty(fillLayerId(slot), 'fill-opacity', entry.opacity);
      this.map.setPaintProperty(metroFillLayerId(slot), 'fill-opacity', entry.opacity * 0.3);
      this.map.setPaintProperty(lineLayerId(slot), 'line-width', active ? 3 : 1.75);
      this.map.setPaintProperty(metroLineLayerId(slot), 'line-width', active ? 2 : 1.25);
    }
  }

  private bindPointerEvents(): void {
    const end = (): void => this.endDrag();
    this.map.on('mousedown', (e: MapMouseEvent) => this.beginDrag(e, e.point));
    this.map.on('touchstart', (e: MapTouchEvent) => {
      if (e.points.length === 1) this.beginDrag(e, e.point, TOUCH_TOLERANCE_PX);
      else end();
    });
    this.map.on('mousemove', (e: MapMouseEvent) => {
      if (this.drag) this.continueDrag(e);
      else this.map.getCanvas().style.cursor = this.slotAt(e.point) ? 'grab' : '';
    });
    this.map.on('touchmove', (e: MapTouchEvent) => this.continueDrag(e));
    this.map.on('mouseup', end);
    this.map.on('touchend', end);
    this.map.on('touchcancel', end);
    window.addEventListener('mouseup', end);
    window.addEventListener('blur', end);
  }

  private beginDrag(e: MapMouseEvent | MapTouchEvent, point: { x: number; y: number }, tolerance = 2): void {
    const slot = this.slotAt(point, tolerance);
    const centre = slot ? this.model?.slots[slot]?.centre : undefined;
    if (!slot || !centre) return;
    e.preventDefault();
    this.map.dragPan.disable();
    this.map.getCanvas().style.cursor = 'grabbing';
    this.drag = { slot, start: [e.lngLat.lng, e.lngLat.lat], centre };
    this.events.onPick(slot);
  }

  private continueDrag(e: MapMouseEvent | MapTouchEvent): void {
    if (!this.drag) return;
    e.preventDefault();
    this.events.onMove(this.drag.slot, translate(this.drag.centre, this.drag.start, [e.lngLat.lng, e.lngLat.lat]));
  }

  private endDrag(): void {
    if (!this.drag) return;
    const { slot } = this.drag;
    this.drag = null;
    this.map.dragPan.enable();
    this.map.getCanvas().style.cursor = '';
    this.events.onMoveEnd(slot);
  }

  /** Top-most city under the pointer; city fills win over the larger metro fills. */
  private slotAt(point: { x: number; y: number }, tolerance = 2): Slot | null {
    if (!this.map.isStyleLoaded()) return null;
    const box: [PointLike, PointLike] = [
      [point.x - tolerance, point.y - tolerance],
      [point.x + tolerance, point.y + tolerance],
    ];
    const features = this.map.queryRenderedFeatures(box, { layers: [...hitLayers('b'), ...hitLayers('a')] });
    const hit = features.find((f) => f.layer.id.endsWith('-city-fill')) ?? features[0];
    const id = hit?.layer.id ?? '';
    return id.startsWith('b-') ? 'b' : id.startsWith('a-') ? 'a' : null;
  }
}

function feature(kind: 'city' | 'metro', geometry: MultiPolygon): Feature<GeoJsonMultiPolygon> {
  return {
    type: 'Feature',
    properties: { kind },
    geometry: { type: 'MultiPolygon', coordinates: geometry as unknown as Position[][][] },
  };
}
