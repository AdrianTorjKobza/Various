import type { CityBoundaries, CityShapes, LngLat, LocalShape, MultiPolygon, XY } from './types';

/**
 * True-size geometry.
 *
 * Each city is projected once into a local equal-area plane (sinusoidal projection centred on the
 * city's anchor). Placing it elsewhere re-projects those metres around the new centre, so the shape
 * keeps its real-world size at any latitude – the same idea "true size" country tools use.
 */

export const EARTH_RADIUS_M = 6_371_008.8;
const RAD = Math.PI / 180;
export const MAX_CENTRE_LAT = 75;
const MAX_VERTEX_LAT = 85;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function wrapLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function normaliseCentre([lng, lat]: LngLat): LngLat {
  return [wrapLng(lng), clamp(lat, -MAX_CENTRE_LAT, MAX_CENTRE_LAT)];
}

export function toLocal(geometry: MultiPolygon, anchor: LngLat): LocalShape {
  const [lng0, lat0] = anchor;
  return geometry.map((polygon) =>
    polygon.map((ring) =>
      ring.map(([lng, lat]): XY => [
        (lng - lng0) * RAD * EARTH_RADIUS_M * Math.cos(lat * RAD),
        (lat - lat0) * RAD * EARTH_RADIUS_M,
      ]),
    ),
  );
}

/** Places a local shape at `centre`, rotated clockwise by `rotationDeg`. */
export function placeShape(shape: LocalShape, centre: LngLat, rotationDeg: number): MultiPolygon {
  const [lng0, lat0] = centre;
  const theta = -rotationDeg * RAD;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return shape.map((polygon) =>
    polygon.map((ring) =>
      ring.map(([x, y]): LngLat => {
        const xr = x * cos - y * sin;
        const yr = x * sin + y * cos;
        const lat = clamp(lat0 + yr / EARTH_RADIUS_M / RAD, -MAX_VERTEX_LAT, MAX_VERTEX_LAT);
        const lng = lng0 + xr / (EARTH_RADIUS_M * Math.cos(lat * RAD)) / RAD;
        return [lng, lat];
      }),
    ),
  );
}

function ringArea(ring: readonly XY[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]!;
    const b = ring[i]!;
    sum += (a[0] + b[0]) * (a[1] - b[1]);
  }
  return Math.abs(sum / 2);
}

/** Area in m² (outer rings minus holes). */
export function shapeArea(shape: LocalShape): number {
  return shape.reduce((total, polygon) => {
    const [outer, ...holes] = polygon;
    if (!outer) return total;
    return total + ringArea(outer) - holes.reduce((h, ring) => h + ringArea(ring), 0);
  }, 0);
}

export function buildShapes(boundaries: CityBoundaries, anchor: LngLat): CityShapes {
  const city = toLocal(boundaries.city, anchor);
  const metro = boundaries.metro ? toLocal(boundaries.metro, anchor) : null;
  return {
    city,
    metro,
    cityAreaM2: shapeArea(city),
    metroAreaM2: metro ? shapeArea(metro) : null,
  };
}

export type Bounds = readonly [LngLat, LngLat];

export function boundsOf(geometries: readonly MultiPolygon[]): Bounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const geometry of geometries) {
    for (const polygon of geometry) {
      for (const [lng, lat] of polygon[0] ?? []) {
        west = Math.min(west, lng);
        east = Math.max(east, lng);
        south = Math.min(south, lat);
        north = Math.max(north, lat);
      }
    }
  }
  return Number.isFinite(west) ? [[west, south], [east, north]] : null;
}

/** Moves `centre` by the pointer delta between `from` and `to`. */
export function translate(centre: LngLat, from: LngLat, to: LngLat): LngLat {
  return normaliseCentre([centre[0] + (to[0] - from[0]), centre[1] + (to[1] - from[1])]);
}
