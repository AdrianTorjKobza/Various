/** [longitude, latitude] in decimal degrees (GeoJSON order). */
export type LngLat = readonly [number, number];
export type Ring = readonly LngLat[];
export type Polygon = readonly Ring[];
export type MultiPolygon = readonly Polygon[];

/** Planar coordinates in metres, relative to a city's anchor point. */
export type XY = readonly [number, number];
export type LocalShape = readonly (readonly (readonly XY[])[])[];

/** Monthly climate normals (index 0 = January), in °C. */
export interface Climate {
  readonly tmax: readonly number[];
  readonly tmin: readonly number[];
}

/** Lightweight city record, loaded for every city up front. */
export interface CitySummary {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly countryCode: string;
  readonly region: string;
  readonly lat: number;
  readonly lon: number;
  readonly population: number | null;
  readonly metroPopulation: number | null;
  readonly timezone: string;
  /** Position in the top-destinations ranking (1 = most visited); null when unranked. */
  readonly rank: number | null;
  readonly aliases: readonly string[];
  /** Null when climate data is unavailable; the UI then simply omits the chart. */
  readonly climate: Climate | null;
  /** How "city limits" are defined for this city, when it differs from the plain administrative boundary. */
  readonly boundaryNote: string | null;
}

/** Boundary geometry, loaded on demand per city. */
export interface CityBoundaries {
  readonly id: string;
  readonly city: MultiPolygon;
  readonly metro: MultiPolygon | null;
}

/** Boundaries converted to local metres around the city anchor, ready to be placed anywhere. */
export interface CityShapes {
  readonly city: LocalShape;
  readonly metro: LocalShape | null;
  readonly cityAreaM2: number;
  readonly metroAreaM2: number | null;
}
