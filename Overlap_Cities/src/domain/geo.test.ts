import { describe, expect, it } from 'vitest';
import { boundsOf, EARTH_RADIUS_M, normaliseCentre, placeShape, shapeArea, toLocal, translate, wrapLng } from './geo';
import type { MultiPolygon } from './types';

/** A square of `sideKm` around (lng, lat). */
function square(lng: number, lat: number, sideKm = 1): MultiPolygon {
  const dLat = (sideKm * 1000) / EARTH_RADIUS_M / (Math.PI / 180);
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  const [w, e, s, n] = [lng - dLng / 2, lng + dLng / 2, lat - dLat / 2, lat + dLat / 2];
  return [[[[w, s], [e, s], [e, n], [w, n], [w, s]]]];
}

describe('geo', () => {
  it('computes true area in m²', () => {
    expect(shapeArea(toLocal(square(2.35, 48.85), [2.35, 48.85])) / 1e6).toBeCloseTo(1, 2);
  });

  it('keeps the true size when a shape is moved to another latitude', () => {
    const local = toLocal(square(10, 60, 5), [10, 60]);
    const moved = placeShape(local, [0, 0], 0);
    expect(shapeArea(toLocal(moved, [0, 0])) / shapeArea(local)).toBeCloseTo(1, 2);
    const width = (mp: MultiPolygon): number => {
      const lngs = mp[0]![0]!.map((p) => p[0]);
      return Math.max(...lngs) - Math.min(...lngs);
    };
    expect(width(moved)).toBeLessThan(width(square(10, 60, 5)));
  });

  it('round-trips a shape placed at its own anchor', () => {
    const original = square(-74, 40.7);
    const placed = placeShape(toLocal(original, [-74, 40.7]), [-74, 40.7], 0);
    placed[0]![0]!.forEach(([lng, lat], i) => {
      expect(lng).toBeCloseTo(original[0]![0]![i]![0], 6);
      expect(lat).toBeCloseTo(original[0]![0]![i]![1], 6);
    });
  });

  it('rotation preserves area', () => {
    const local = toLocal(square(0, 0, 3), [0, 0]);
    expect(shapeArea(toLocal(placeShape(local, [0, 0], 45), [0, 0])) / shapeArea(local)).toBeCloseTo(1, 3);
  });

  it('subtracts holes', () => {
    const outer = square(0, 0, 2)[0]![0]!;
    const hole = square(0, 0, 1)[0]![0]!;
    expect(shapeArea(toLocal([[outer, hole]], [0, 0])) / 1e6).toBeCloseTo(3, 2);
  });

  it('wraps longitudes and clamps centre latitude', () => {
    expect(wrapLng(190)).toBe(-170);
    expect(wrapLng(-181)).toBe(179);
    expect(normaliseCentre([0, 89])).toEqual([0, 75]);
    expect(translate([179, 0], [0, 0], [2, 1])).toEqual([-179, 1]);
  });

  it('computes bounds and handles empty input', () => {
    expect(boundsOf([])).toBeNull();
    const b = boundsOf([square(0, 0), square(10, 10)]);
    expect(b?.[0][0]).toBeLessThan(0);
    expect(b?.[1][1]).toBeGreaterThan(10);
  });
});
