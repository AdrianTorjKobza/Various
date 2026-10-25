#!/usr/bin/env python3
"""
Builds the static dataset served by Overlap Cities (public/data/).

Which cities are included
  1. The curated top-100 destinations in cities.csv (hand-tuned boundaries, see below).
  2. Every other GeoNames city with population >= --min-population (default 300,000),
     with boundaries chosen by automatic rules. Cities that sit inside a city already
     built (e.g. Brooklyn inside New York, Tokyo's wards) are skipped as duplicates.

Sources
  * GeoNames cities5000 + countryInfo   names, alternate names (search), population, time zone
  * OpenStreetMap via Nominatim          city-limit boundaries
  * GHSL GHS-FUA R2019A (EC JRC)         metro areas (functional urban areas)
  * Open-Meteo historical archive        monthly temperature normals

Usage
  python build_data.py --contact you@example.com --dry-run   # count cities, download nothing else
  python build_data.py --contact you@example.com             # full build (asks before starting)
  python build_data.py --contact you@example.com --yes       # full build, no prompt

Every response is cached in .cache/data, so re-running is fast and only fetches what is missing.
Climate is best-effort: when Open-Meteo's free daily limit is reached, the build keeps going
without climate for the remaining cities (previously fetched climate is kept). Re-run on a later
day to fill the gaps; the app simply hides the chart for cities without climate.

Curated boundary columns (cities.csv)
  osm_query      Nominatim query for one administrative boundary (default: "<name>, <country>").
  osm_id         Pin an exact OSM object instead, e.g. R7444 for a relation.
  osm_parts      Pipe-separated queries whose boundaries are merged, e.g. Tokyo's 23 wards.
  clip_to_metro  "yes" = keep only the part inside the GHSL urban area.
  expected_km2   Reference area; the report flags results that differ by more than 20%.
  boundary_note  Shown to users under "City limits" in the City facts panel.

Review build/data-report.csv after each run.
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import re
import shutil
import statistics
import time
import unicodedata
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import geopandas as gpd
import requests
from shapely.geometry import MultiPolygon, Point, Polygon, mapping, shape  # noqa: F401
from shapely.geometry.base import BaseGeometry
from shapely.ops import unary_union
from shapely.prepared import prep
from shapely.validation import make_valid

from regions import SUBREGION

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent

GEONAMES_CITIES = "https://download.geonames.org/export/dump/cities5000.zip"
GEONAMES_COUNTRIES = "https://download.geonames.org/export/dump/countryInfo.txt"
GHSL_FUA = (
    "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_FUA_UCDB2015_GLOBE_R2019A/V1-0/"
    "GHS_FUA_UCDB2015_GLOBE_R2019A_54009_1K_V1_0.zip"
)
NOMINATIM = "https://nominatim.openstreetmap.org"
OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"

CITY_TOLERANCE_DEG = 0.0003  # ~30 m: crisp at street level, small files
METRO_TOLERANCE_DEG = 0.0015  # ~150 m: metro outlines are 1 km grid cells anyway
MIN_PART_SHARE = 0.01  # drop islands/exclaves smaller than 1% of the largest part
COORD_DECIMALS = 5
LARGE_CITY_KM2 = 3000
EXPECTED_TOLERANCE = 0.20
AUTO_CLIP_RATIO = 3.0  # auto cities: clip when the official area is > 3x its urbanised part
MIN_CITY_KM2 = 1.0
MAX_ALIASES = 15
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")

# GeoNames feature codes that are cities in their own right. Excluded: PPLX (section of a city,
# e.g. a borough), PPLH/PPLQ/PPLW (historical/abandoned/destroyed), PPLF/PPLR/PPLL (villages, farms).
CITY_FEATURE_CODES = {"PPL", "PPLA", "PPLA2", "PPLA3", "PPLA4", "PPLA5", "PPLC", "PPLG", "PPLS"}

# Nominatim "addresstype" preference: a city-level unit beats a province of the same name
# (e.g. the municipality of Madrid vs the Comunidad de Madrid).
ADDRESSTYPE_RANK = {
    "city": 0, "municipality": 0, "town": 1, "city_district": 2, "district": 2, "borough": 2, "suburb": 3,
    "county": 4, "state_district": 5, "province": 6, "state": 6, "region": 7, "country": 9,
}

log = logging.getLogger("build_data")


# ---------------------------------------------------------------- helpers

def normalise(text: str) -> str:
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def slugify(text: str) -> str:
    return normalise(text).replace(" ", "-")[:48].strip("-") or "city"


def is_latin(text: str) -> bool:
    """Keeps alternate names a Latin-keyboard user could type (drops other scripts and codes)."""
    return 2 <= len(text) <= 60 and all(c.isalpha() and ord(c) < 0x250 or c in " -'.," for c in text)


class RateLimited(RuntimeError):
    """The provider's free quota is used up."""


class Http:
    """requests session with caching, an identifying User-Agent and a per-host rate limit."""

    def __init__(self, cache: Path, contact: str):
        self.cache = cache
        self.session = requests.Session()
        self.session.headers["User-Agent"] = f"overlap-cities-data-pipeline/1.1 ({contact})"
        self._last: dict[str, float] = {}

    def _wait(self, host: str, interval: float) -> None:
        elapsed = time.monotonic() - self._last.get(host, 0.0)
        if elapsed < interval:
            time.sleep(interval - elapsed)
        self._last[host] = time.monotonic()

    def download(self, url: str, name: str) -> Path:
        target = self.cache / name
        if target.exists():
            return target
        log.info("Downloading %s", url)
        tmp = target.with_suffix(target.suffix + ".part")
        with self.session.get(url, stream=True, timeout=120) as response:
            response.raise_for_status()
            with tmp.open("wb") as fh:
                shutil.copyfileobj(response.raw, fh)
        tmp.rename(target)
        return target

    def cached_json(self, cache_key: str) -> Any | None:
        target = self.cache / "json" / f"{cache_key}.json"
        return json.loads(target.read_text("utf-8")) if target.exists() else None

    def get_json(self, url: str, params: dict[str, Any], cache_key: str, interval: float, fail_fast_on_429: bool = False) -> Any:
        cached = self.cached_json(cache_key)
        if cached is not None:
            return cached
        host = requests.utils.urlparse(url).netloc
        for attempt in range(4):
            self._wait(host, interval)
            response = self.session.get(url, params=params, timeout=60)
            if response.status_code == 429:
                if fail_fast_on_429:
                    raise RateLimited(host)
                time.sleep(5 * (attempt + 1))
                continue
            if response.status_code >= 500:
                time.sleep(5 * (attempt + 1))
                continue
            response.raise_for_status()
            data = response.json()
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(json.dumps(data), "utf-8")
            return data
        raise RuntimeError(f"Giving up on {url} after retries")


def cache_key(prefix: str, text: str) -> str:
    return f"{prefix}-{normalise(text).replace(' ', '-')[:80]}"


# ---------------------------------------------------------------- GeoNames

@dataclass
class Place:
    geonames_id: int
    name: str
    ascii_name: str
    lat: float
    lon: float
    feature_code: str
    country_code: str
    population: int
    timezone: str
    aliases: list[str] = field(default_factory=list)


class GeoNames:
    def __init__(self, http: Http):
        zipped = http.download(GEONAMES_CITIES, "cities5000.zip")
        self.by_id: dict[int, Place] = {}
        self.by_name: dict[tuple[str, str], list[Place]] = {}
        with zipfile.ZipFile(zipped) as zf, zf.open("cities5000.txt") as fh:
            for raw in fh:
                cols = raw.decode("utf-8").rstrip("\n").split("\t")
                place = Place(
                    geonames_id=int(cols[0]),
                    name=cols[1],
                    ascii_name=cols[2] or cols[1],
                    lat=float(cols[4]),
                    lon=float(cols[5]),
                    feature_code=cols[7],
                    country_code=cols[8],
                    population=int(cols[14] or 0),
                    timezone=cols[17],
                    aliases=[a for a in cols[3].split(",") if a],
                )
                self.by_id[place.geonames_id] = place
                for n in {place.name, place.ascii_name, *place.aliases}:
                    self.by_name.setdefault((place.country_code, normalise(n)), []).append(place)

        self.countries: dict[str, str] = {}
        for line in http.download(GEONAMES_COUNTRIES, "countryInfo.txt").read_text("utf-8").splitlines():
            if line and not line.startswith("#"):
                cols = line.split("\t")
                self.countries[cols[0]] = cols[4]

    def resolve(self, query: str, country_code: str, geonames_id: str) -> Place:
        if geonames_id:
            return self.by_id[int(geonames_id)]
        candidates = self.by_name.get((country_code, normalise(query)), [])
        if not candidates:
            raise LookupError(f"GeoNames: no match for {query!r} in {country_code}")
        return max(candidates, key=lambda p: p.population)  # most populous namesake

    def cities_over(self, min_population: int) -> list[Place]:
        places = [p for p in self.by_id.values() if p.population >= min_population and p.feature_code in CITY_FEATURE_CODES]
        return sorted(places, key=lambda p: -p.population)

    def country_name(self, code: str) -> str:
        overrides = {"TR": "Türkiye", "KR": "South Korea", "TW": "Taiwan", "CZ": "Czech Republic"}
        return overrides.get(code) or self.countries.get(code, code)


# ---------------------------------------------------------------- OpenStreetMap

def _rank(result: dict[str, Any]) -> tuple[int, int, float]:
    return (
        result.get("osm_type") != "relation",
        ADDRESSTYPE_RANK.get(result.get("addresstype", ""), 8),
        -float(result.get("importance") or 0),
    )


def _polygons(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [r for r in results if r.get("geojson", {}).get("type") in ("Polygon", "MultiPolygon")]


def _ref(result: dict[str, Any]) -> str:
    return f"{result['osm_type'][0].upper()}{result['osm_id']}"


class Nominatim:
    """City limits from OSM. Respects the usage policy: 1 request/s, identifying UA, cached results."""

    PARAMS = {"format": "jsonv2", "polygon_geojson": 1, "polygon_threshold": 0.0001}

    def __init__(self, http: Http):
        self.http = http

    def _search(self, query: str, country_code: str) -> list[dict[str, Any]]:
        results = self.http.get_json(
            f"{NOMINATIM}/search",
            {**self.PARAMS, "q": query, "countrycodes": country_code.lower(), "limit": 10},
            cache_key(f"nominatim-{country_code}", query),
            1.1,
        )
        return _polygons(results)

    def _reverse(self, point: Point) -> list[dict[str, Any]]:
        result = self.http.get_json(
            f"{NOMINATIM}/reverse",
            {**self.PARAMS, "lat": round(point.y, 5), "lon": round(point.x, 5), "zoom": 10},
            f"reverse-{point.y:.4f}-{point.x:.4f}",
            1.1,
        )
        return _polygons([result]) if isinstance(result, dict) else []

    def boundary(self, query: str, country_code: str, point: Point, osm_id: str = "") -> tuple[BaseGeometry, str, str]:
        """One administrative boundary, preferring a city-level relation that contains the city point."""
        if osm_id:
            polygons = _polygons(self.http.get_json(f"{NOMINATIM}/lookup", {**self.PARAMS, "osm_ids": osm_id}, f"osm-{osm_id}", 1.1))
        else:
            polygons = self._search(query, country_code)
        containing = [r for r in polygons if make_valid(shape(r["geojson"])).contains(point)]
        pool = containing or polygons
        if not pool:
            raise LookupError(f"Nominatim: no boundary polygon for {query or osm_id!r}")
        best = min(pool, key=_rank)
        return make_valid(shape(best["geojson"])), _ref(best), best.get("display_name", "")

    def boundary_containing(self, query: str, country_code: str, point: Point) -> tuple[BaseGeometry, str, str]:
        """Automatic cities: the result MUST contain the city point; falls back to a reverse lookup."""
        containing = [r for r in self._search(query, country_code) if make_valid(shape(r["geojson"])).contains(point)]
        if not containing:
            containing = [r for r in self._reverse(point) if make_valid(shape(r["geojson"])).contains(point)]
        if not containing:
            raise LookupError("no OSM boundary contains the city point")
        best = min(containing, key=_rank)
        return make_valid(shape(best["geojson"])), _ref(best), best.get("display_name", "")

    def union_of_parts(self, queries: list[str], country_code: str) -> tuple[BaseGeometry, str, str]:
        """Merges several boundaries (e.g. central districts). Each part must resolve, or the city fails."""
        geometries, refs = [], []
        for query in queries:
            polygons = self._search(query, country_code)
            if not polygons:
                raise LookupError(f"Nominatim: no boundary polygon for part {query!r}")
            best = min(polygons, key=_rank)
            geometries.append(make_valid(shape(best["geojson"])))
            refs.append(_ref(best))
        return make_valid(unary_union(geometries)), "+".join(refs), f"{len(queries)} parts"


# ---------------------------------------------------------------- GHSL metro areas

class MetroAreas:
    def __init__(self, http: Http, fua_zip: Path | None):
        zipped = fua_zip or http.download(GHSL_FUA, "ghs_fua.zip")
        extract_dir = http.cache / "ghs_fua"
        if not extract_dir.exists():
            with zipfile.ZipFile(zipped) as zf:
                zf.extractall(extract_dir)
        gpkg = next(extract_dir.rglob("*.gpkg"))
        frame = gpd.read_file(gpkg)
        self.frame = frame.to_crs(4326)
        self.population_column = next((c for c in frame.columns if re.fullmatch(r"(?i)fua_p_2015", c)), None)
        self.frame.sindex  # build the spatial index once

    def containing(self, point: Point) -> tuple[BaseGeometry | None, int | None]:
        hits = self.frame.iloc[self.frame.sindex.query(point, predicate="intersects")]
        if hits.empty:
            return None, None
        row = hits.iloc[0]
        population = int(row[self.population_column]) if self.population_column and row[self.population_column] else None
        return make_valid(row.geometry), population


# ---------------------------------------------------------------- climate (best-effort)

class Climate:
    """
    Monthly temperature normals from Open-Meteo. Never fails the build: when the free quota
    runs out it stops asking for the rest of the run and falls back to previously built values.
    """

    def __init__(self, http: Http, years: int, previous: dict[str, Any], enabled: bool):
        self.http = http
        self.years = years
        self.previous = previous
        self.enabled = enabled
        self.exhausted = False
        self.missing = 0

    def get(self, city_id: str, lat: float, lon: float) -> dict[str, list[float]] | None:
        result = None
        if self.enabled:
            try:
                result = self._fetch(lat, lon, cache_only=self.exhausted)
            except RateLimited:
                self.exhausted = True
                log.warning("Open-Meteo free limit reached – continuing without new climate data. Re-run later to fill the gaps.")
            except Exception as error:  # climate is optional
                log.debug("climate %s: %s", city_id, error)
        result = result or self.previous.get(city_id)
        if result is None:
            self.missing += 1
        return result

    def _fetch(self, lat: float, lon: float, cache_only: bool) -> dict[str, list[float]] | None:
        end_year = datetime.now(timezone.utc).year - 1
        start_year = end_year - self.years + 1
        key = f"climate-{lat:.3f}-{lon:.3f}-{start_year}-{end_year}"
        if cache_only:  # quota used up: cached responses are still free to use
            data = self.http.cached_json(key)
            return self._normals(data) if data else None
        data = self.http.get_json(
            OPEN_METEO_ARCHIVE,
            {
                "latitude": round(lat, 4),
                "longitude": round(lon, 4),
                "start_date": f"{start_year}-01-01",
                "end_date": f"{end_year}-12-31",
                "daily": "temperature_2m_max,temperature_2m_min",
                "timezone": "auto",
            },
            key,
            1.0,
            fail_fast_on_429=True,
        )
        return self._normals(data)

    @staticmethod
    def _normals(data: dict[str, Any]) -> dict[str, list[float]] | None:
        daily = data.get("daily") or {}
        buckets: dict[str, list[list[float]]] = {"tmax": [[] for _ in range(12)], "tmin": [[] for _ in range(12)]}
        for day, tmax, tmin in zip(daily.get("time", []), daily.get("temperature_2m_max", []), daily.get("temperature_2m_min", [])):
            month = int(day[5:7]) - 1
            if tmax is not None:
                buckets["tmax"][month].append(tmax)
            if tmin is not None:
                buckets["tmin"][month].append(tmin)
        if any(not values for series in buckets.values() for values in series):
            return None
        return {k: [round(statistics.fmean(v), 1) for v in series] for k, series in buckets.items()}


# ---------------------------------------------------------------- geometry

def polygons_of(geometry: BaseGeometry) -> list[Polygon]:
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    if hasattr(geometry, "geoms"):  # GeometryCollection from make_valid / intersection
        return [p for g in geometry.geoms for p in polygons_of(g)]
    return []


def clean(geometry: BaseGeometry, tolerance: float) -> list:
    """Drops tiny detached parts, simplifies and rounds; returns MultiPolygon coordinates."""
    parts = polygons_of(geometry)
    if not parts:
        raise ValueError("geometry has no polygons")
    largest = max(p.area for p in parts)
    kept = [p for p in parts if p.area >= largest * MIN_PART_SHARE]
    simplified = make_valid(MultiPolygon(kept).simplify(tolerance, preserve_topology=True))
    rnd = lambda ring: [[round(x, COORD_DECIMALS), round(y, COORD_DECIMALS)] for x, y in ring.coords]  # noqa: E731
    return [[rnd(p.exterior), *[rnd(i) for i in p.interiors]] for p in polygons_of(simplified) if len(p.exterior.coords) >= 4]


def area_km2(geometry: BaseGeometry) -> float:
    return float(gpd.GeoSeries([geometry], crs=4326).to_crs("ESRI:54009").area.iloc[0] / 1e6)


class Coverage:
    """Boundaries already built; a candidate whose point falls inside one is a duplicate (e.g. a borough)."""

    def __init__(self) -> None:
        self._items: list[tuple[tuple[float, float, float, float], Any, str]] = []

    def add(self, geometry: BaseGeometry, city_id: str) -> None:
        self._items.append((geometry.bounds, prep(geometry), city_id))

    def owner_of(self, point: Point) -> str | None:
        for (minx, miny, maxx, maxy), prepared, city_id in self._items:
            if minx <= point.x <= maxx and miny <= point.y <= maxy and prepared.contains(point):
                return city_id
        return None


# ---------------------------------------------------------------- boundary rules

@dataclass
class Boundary:
    city: BaseGeometry
    metro: BaseGeometry | None
    metro_population: int | None
    osm_ref: str
    osm_name: str
    note: str | None
    warnings: list[str]


def curated_boundary(row: dict[str, str], place: Place, country: str, nominatim: Nominatim, metros: MetroAreas) -> Boundary:
    point = Point(place.lon, place.lat)
    warnings: list[str] = []
    if row.get("osm_parts"):
        city, ref, name = nominatim.union_of_parts([q.strip() for q in row["osm_parts"].split("|") if q.strip()], row["country_code"])
    else:
        city, ref, name = nominatim.boundary(row["osm_query"] or f"{row['name']}, {country}", row["country_code"], point, row.get("osm_id", ""))

    fua, metro_population = metros.containing(point)
    if fua is None:
        warnings.append("no GHSL metro area")
    if row.get("clip_to_metro", "").lower() == "yes":
        if fua is None:
            raise ValueError("clip_to_metro requested but no GHSL urban area contains the city point")
        admin_km2 = area_km2(city)
        city = make_valid(city.intersection(fua))
        warnings.append(f"clipped to urban area (admin unit {admin_km2:,.0f} km²)")
    if not city.buffer(0).contains(point):
        warnings.append("city point outside boundary")

    city_km2 = area_km2(city)
    expected = float(row["expected_km2"]) if row.get("expected_km2") else None
    if expected and abs(city_km2 / expected - 1) > EXPECTED_TOLERANCE:
        warnings.append(f"AREA MISMATCH: expected ~{expected:,.0f} km²")
    if city_km2 > LARGE_CITY_KM2 and not row.get("boundary_note"):
        warnings.append("very large city boundary – consider osm_parts or clip_to_metro")

    metro = make_valid(unary_union([fua, city])) if fua is not None else None
    return Boundary(city, metro, metro_population, ref, name, row.get("boundary_note") or None, warnings)


def auto_boundary(place: Place, country: str, nominatim: Nominatim, metros: MetroAreas) -> Boundary:
    """
    Rules for the cities that are not hand-tuned:
      * the OSM boundary must contain the GeoNames city point (search by name, then reverse lookup);
      * if it is more than 3x larger than its urbanised part, or over 3,000 km², keep only the urbanised part;
      * a province-sized boundary with no GHSL urban area is rejected rather than shown misleadingly.
    """
    point = Point(place.lon, place.lat)
    city, ref, name = nominatim.boundary_containing(f"{place.name}, {country}", place.country_code, point)
    fua, metro_population = metros.containing(point)
    admin_km2 = area_km2(city)
    note = None
    warnings: list[str] = []

    if fua is not None:
        urban = make_valid(city.intersection(fua))
        urban_km2 = area_km2(urban) if not urban.is_empty else 0.0
        if urban_km2 >= MIN_CITY_KM2 and (admin_km2 > AUTO_CLIP_RATIO * urban_km2 or admin_km2 > LARGE_CITY_KM2):
            city = urban
            note = "Urbanised part of the official boundary"
            warnings.append(f"auto-clipped (admin unit {admin_km2:,.0f} km²)")
    elif admin_km2 > LARGE_CITY_KM2:
        raise ValueError(f"province-sized boundary ({admin_km2:,.0f} km²) with no urban area to clip to")
    else:
        warnings.append("no GHSL metro area")

    if area_km2(city) < MIN_CITY_KM2:
        raise ValueError("boundary smaller than 1 km² – probably not the city")
    metro = make_valid(unary_union([fua, city])) if fua is not None else None
    return Boundary(city, metro, metro_population, ref, name, note, warnings)


# ---------------------------------------------------------------- build

class IdAllocator:
    def __init__(self) -> None:
        self.used: set[str] = set()

    def reserve(self, city_id: str) -> None:
        if not ID_PATTERN.match(city_id) or city_id in self.used:
            raise ValueError(f"Invalid or duplicate id {city_id!r}")
        self.used.add(city_id)

    def allocate(self, place: Place) -> str:
        base = slugify(place.ascii_name)
        for candidate in (base, f"{base}-{place.country_code.lower()}", f"{base}-{place.country_code.lower()}-{place.geonames_id}"):
            if candidate not in self.used:
                self.used.add(candidate)
                return candidate
        raise ValueError(f"Cannot allocate an id for {place.name}")


class Builder:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        self.out: Path = args.out
        (self.out / "boundaries").mkdir(parents=True, exist_ok=True)
        args.build_dir.mkdir(parents=True, exist_ok=True)
        (args.cache / "json").mkdir(parents=True, exist_ok=True)

        self.http = Http(args.cache, args.contact)
        self.geonames = GeoNames(self.http)
        self.cities: list[dict[str, Any]] = []
        self.report: list[dict[str, Any]] = []
        self.coverage = Coverage()
        self.ids = IdAllocator()

    def plan(self) -> tuple[list[dict[str, str]], list[Place]]:
        rows = list(csv.DictReader(self.args.cities.open(encoding="utf-8")))
        candidates = self.geonames.cities_over(self.args.min_population)
        if self.args.limit is not None:
            candidates = candidates[: self.args.limit]
        return rows, candidates

    def run(self, rows: list[dict[str, str]], candidates: list[Place]) -> None:
        self.nominatim = Nominatim(self.http)
        self.metros = MetroAreas(self.http, self.args.fua_zip)
        self.climate = Climate(self.http, self.args.climate_years, self._previous_climate(), not self.args.skip_climate)

        curated_ids: set[int] = set()
        for row in rows:
            self.ids.reserve(row["id"])
        for row in rows:
            place = self._curated(row)
            if place:
                curated_ids.add(place.geonames_id)

        total = len(candidates)
        for n, place in enumerate(candidates, 1):
            if place.geonames_id in curated_ids:
                continue
            owner = self.coverage.owner_of(Point(place.lon, place.lat))
            if owner:
                self.report.append({"id": "", "name": place.name, "kind": "auto", "geonames_id": place.geonames_id, "notes": f"skipped: inside {owner}"})
                continue
            self._auto(place)
            if n % 100 == 0:
                log.info("… %d/%d candidates processed", n, total)

        self._write()

    def _previous_climate(self) -> dict[str, Any]:
        index = self.out / "cities.json"
        if not index.exists():
            return {}
        try:
            return {c["id"]: c["climate"] for c in json.loads(index.read_text("utf-8")).get("cities", []) if c.get("climate")}
        except (ValueError, KeyError):
            return {}

    def _curated(self, row: dict[str, str]) -> Place | None:
        city_id = row["id"]
        try:
            place = self.geonames.resolve(row["geonames_query"] or row["name"], row["country_code"], row.get("geonames_id", ""))
            country = self.geonames.country_name(row["country_code"])
            boundary = curated_boundary(row, place, country, self.nominatim, self.metros)
            self._emit(city_id, row["name"], place, int(row["rank"]) if row["rank"] else None, boundary, "curated", row.get("rank_source", ""), row.get("expected_km2", ""))
            return place
        except Exception as error:
            log.error("%s: %s", city_id, error)
            self.report.append({"id": city_id, "name": row["name"], "kind": "curated", "rank_source": row.get("rank_source", ""), "notes": f"FAILED: {error}"})
            return None

    def _auto(self, place: Place) -> None:
        try:
            country = self.geonames.country_name(place.country_code)
            boundary = auto_boundary(place, country, self.nominatim, self.metros)
            self._emit(self.ids.allocate(place), place.name, place, None, boundary, "auto", "", "")
        except Exception as error:
            log.info("skipped %s (%s): %s", place.name, place.country_code, error)
            self.report.append({"id": "", "name": place.name, "kind": "auto", "geonames_id": place.geonames_id, "notes": f"skipped: {error}"})

    def _emit(self, city_id: str, name: str, place: Place, rank: int | None, b: Boundary, kind: str, rank_source: str, expected: str) -> None:
        boundaries = {
            "id": city_id,
            "city": clean(b.city, CITY_TOLERANCE_DEG),
            "metro": clean(b.metro, METRO_TOLERANCE_DEG) if b.metro is not None else None,
        }
        (self.out / "boundaries" / f"{city_id}.json").write_text(json.dumps(boundaries, separators=(",", ":")), "utf-8")
        self.coverage.add(b.city, city_id)

        aliases = sorted({a for a in place.aliases if is_latin(a) and normalise(a) != normalise(name)}, key=len)[:MAX_ALIASES]
        self.cities.append(
            {
                "id": city_id,
                "name": name,
                "country": self.geonames.country_name(place.country_code),
                "countryCode": place.country_code,
                "region": SUBREGION.get(place.country_code, "Other"),
                "lat": round(place.lat, 5),
                "lon": round(place.lon, 5),
                "population": place.population or None,
                "metroPopulation": b.metro_population,
                "timezone": place.timezone,
                "rank": rank,
                "aliases": aliases,
                "climate": self.climate.get(city_id, place.lat, place.lon),
                "boundaryNote": b.note,
            }
        )
        city_km2 = area_km2(b.city)
        self.report.append(
            {
                "id": city_id,
                "name": name,
                "kind": kind,
                "geonames_id": place.geonames_id,
                "osm": b.osm_ref,
                "osm_name": b.osm_name,
                "city_km2": round(city_km2, 1),
                "expected_km2": expected,
                "metro_km2": round(area_km2(b.metro), 1) if b.metro is not None else "",
                "rank_source": rank_source,
                "notes": "; ".join(b.warnings),
            }
        )
        log.info("%-24s %8.1f km²  %s", city_id, city_km2, "; ".join(b.warnings))

    def _write(self) -> None:
        index = {
            "version": 1,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "minPopulation": self.args.min_population,
            "attribution": "OpenStreetMap contributors (ODbL); GeoNames (CC BY 4.0); EC JRC GHSL GHS-FUA R2019A; Open-Meteo (CC BY 4.0)",
            "cities": sorted(self.cities, key=lambda c: (c["rank"] is None, c["rank"] or 0, -(c["population"] or 0))),
        }
        (self.out / "cities.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), "utf-8")

        # Remove outlines of cities that are no longer in the index.
        kept = {f"{c['id']}.json" for c in self.cities}
        for stale in (self.out / "boundaries").glob("*.json"):
            if stale.name not in kept:
                stale.unlink()

        fields = ["id", "name", "kind", "geonames_id", "osm", "osm_name", "city_km2", "expected_km2", "metro_km2", "rank_source", "notes"]
        with (self.args.build_dir / "data-report.csv").open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=fields)
            writer.writeheader()
            writer.writerows(self.report)

        notes = [str(r.get("notes", "")) for r in self.report]
        log.info(
            "Done: %d cities written (%d curated, %d automatic). Failed curated: %d. Skipped candidates: %d (of which duplicates: %d). "
            "Without climate: %d. Flagged for review: %d. See %s",
            len(self.cities),
            sum(1 for r in self.report if r.get("kind") == "curated" and r.get("city_km2") != ""),
            sum(1 for r in self.report if r.get("kind") == "auto" and r.get("id")),
            sum(1 for n in notes if n.startswith("FAILED")),
            sum(1 for n in notes if n.startswith("skipped")),
            sum(1 for n in notes if n.startswith("skipped: inside")),
            self.climate.missing,
            sum(1 for n in notes if "MISMATCH" in n or "outside" in n),
            self.args.build_dir / "data-report.csv",
        )


def summarise(rows: list[dict[str, str]], candidates: list[Place], min_population: int) -> None:
    by_country: dict[str, int] = {}
    for p in candidates:
        by_country[p.country_code] = by_country.get(p.country_code, 0) + 1
    top = ", ".join(f"{cc} {n}" for cc, n in sorted(by_country.items(), key=lambda kv: -kv[1])[:10])
    print(
        f"\nPlan: {len(rows)} curated cities + up to {len(candidates):,} GeoNames cities with population >= {min_population:,}.\n"
        f"      Some candidates will be skipped as duplicates (e.g. boroughs inside a city) or for unusable boundaries.\n"
        f"      Largest countries: {top}\n"
        f"      Expect roughly 1–2 Nominatim requests per city at 1 request/second, plus climate requests.\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--contact", required=True, help="Email or URL identifying you (required by the Nominatim usage policy)")
    parser.add_argument("--min-population", type=int, default=300_000)
    parser.add_argument("--cities", type=Path, default=HERE / "cities.csv")
    parser.add_argument("--out", type=Path, default=ROOT / "public" / "data")
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache" / "data")
    parser.add_argument("--build-dir", type=Path, default=ROOT / "build")
    parser.add_argument("--fua-zip", type=Path, help="Use a manually downloaded GHS-FUA zip")
    parser.add_argument("--climate-years", type=int, default=5, help="Years averaged for the climate chart (fewer = lighter on the free quota)")
    parser.add_argument("--skip-climate", action="store_true", help="Do not request climate (previously fetched values are kept)")
    parser.add_argument("--limit", type=int, help="Only process the N most populous candidates (for testing)")
    parser.add_argument("--dry-run", action="store_true", help="Print the plan and exit")
    parser.add_argument("--yes", action="store_true", help="Do not ask for confirmation")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    builder = Builder(args)
    rows, candidates = builder.plan()
    summarise(rows, candidates, args.min_population)
    if args.dry_run:
        return
    if not args.yes and input("Continue? [y/N] ").strip().lower() != "y":
        return
    builder.run(rows, candidates)


if __name__ == "__main__":
    main()
