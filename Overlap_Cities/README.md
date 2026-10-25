# Overlap Cities

Drag one city over another to compare their **true size**: city limits or metro areas, for every city with 300,000+ inhabitants plus the world's top 100 city destinations.

Built with TypeScript, Vite and MapLibre GL. It's a static site, so there's no backend to run or secure.

---

## Quick start (local testing)

```bash
npm install
npm run dev          # http://localhost:5173
npm run check        # typecheck + lint + format check + unit tests
npm run build        # production build in dist/
npm run preview      # http://localhost:4173, with the production security headers
```

Requires Node 20.19+. The repo ships with **sample data for 4 US cities** so it runs immediately; build the real dataset with the pipeline below.

---

## Features

- **Search all cities offline:** instant, in-browser search over every included city's name and GeoNames alternate names; ignores accents, matches countries. Namesakes are listed with country and region (e.g. Valencia, Spain vs Valencia, Venezuela).
- **True-size comparison:** both cities can be dragged (mouse or touch); rotate and opacity apply to the selected city.
- **City limits or metro area:** "Show metro area" toggle (GHSL Functional Urban Areas).
- **Remembers your last two cities** in the browser only; first-time visitors get a random pair from the top 20 destinations.
- **Share links** restore cities, positions, rotation, opacity and the metro setting.
- **City facts:** country, region, population, time zone and local time, current weather, monthly climate chart, and how "city limits" are defined.
- **Optional extras fail quietly:** if live weather is unavailable, its row is hidden; cities without climate data simply have no chart.
- **Mobile friendly:** bottom-sheet layout below 768 px, 44 px touch targets, native share sheet.

---

## Data pipeline

Needs Python 3.10+ and an unrestricted internet connection (company networks may block some sources).

```bash
cd scripts/data
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python build_data.py --contact you@example.com --dry-run   # shows how many cities will be built
python build_data.py --contact you@example.com             # full build (asks before starting)
```

### Which cities are included

1. **Curated:** the 100 cities in `scripts/data/cities.csv` (Euromonitor *Top 100 City Destinations Index 2025*), with hand-tuned boundaries.
2. **Automatic:** every other GeoNames city with population ≥ 300,000 (`--min-population` to change). Only real cities count: sections of a city (e.g. Harlem) and historical places are excluded by GeoNames feature code. Change the threshold and the app's subtitle together (`index.html`).

A candidate is **skipped** if it lies inside a city already built (e.g. Brooklyn inside New York, Tokyo's wards), if no OpenStreetMap boundary contains its location, or if its only boundary is province-sized with no urban area. Skips are listed in the report.

### How "city limits" are defined

| | Rule |
|---|---|
| Curated cities | Set per city in `cities.csv`: `osm_query` / `osm_id` (one boundary), `osm_parts` (merge districts, e.g. Tokyo's 23 wards, Beijing's 6 central districts), `clip_to_metro=yes` (keep only the urbanised part, e.g. Istanbul, Dubai), `expected_km2` (sanity check), `boundary_note` (shown to users). |
| Automatic cities | The OpenStreetMap boundary that contains the GeoNames city point, preferring city-level units over same-named provinces. If it is more than 3× larger than its urbanised part, or over 3,000 km², only the urbanised part is kept and users see "Urbanised part of the official boundary". |

### Runtime, caching and re-runs

- About 1–2 OpenStreetMap (Nominatim) requests per city at 1 request/second, per its usage policy, so a first build of ~2,000 cities takes roughly 1–2 hours. Nominatim discourages heavy use; this is a one-off build and every response is cached in `.cache/data`, so re-runs only fetch what's missing.
- **Climate is best-effort.** Open-Meteo's free service has a daily limit, and long historical requests count as several calls. When the limit is hit, the build carries on without new climate data, keeps climate from previous builds, and reports how many cities have none. Re-run on later days to fill the gaps. `--climate-years` (default 5) controls how many years are averaged; fewer years use less quota.
- Review `build/data-report.csv` after each run: failed curated cities, area mismatches, auto-clipped and skipped cities are all listed there.

### City list caveats

- **Ranks 68–100 are unverified** (`rank_source` column). Euromonitor publishes the full table only in its paid report; check before launch. Only ranks 1–20 affect app behaviour (the random first-visit pair).
- **Muğla** (rank 100) is a province; the app shows it as **Bodrum (Muğla)**.

### Licences

Keep the "About & data sources" dialog: OpenStreetMap (ODbL), GeoNames (CC BY 4.0) and Open-Meteo (CC BY 4.0) require visible attribution. Open-Meteo's free API is for non-commercial use; a commercial site needs their paid plan.

---

## Deploy

**Vercel:** import the repo. The build command, output directory and all security and cache headers come from `vercel.json`.

**Dedicated hosting (later):** run `npm run build`, copy `dist/` to the server and use `deploy/nginx.conf`, which has the same headers as `vercel.json`. Keep the two CSPs identical.

---

## Architecture

```
src/
  domain/      Pure logic, no DOM: true-size geometry, search, formatting   (unit tested)
  state/       AppState, pure state transitions, tiny observable Store      (unit tested)
  services/    Data loading + validation, share links, preferences, weather (unit tested)
  map/         MapLibre adapter (MapView implements MapRenderer) + style
  ui/          Self-contained components (city picker, controls, panels)
  app.ts       Composition root / controller: store → map, panels, URL, storage
  main.ts      Bootstrap: creates concrete services and injects them
scripts/data/  Python data pipeline
```

- **True size:** each city is projected once into local metres around its centre (an equal-area sinusoidal projection) and re-projected around its new position when moved.
- **Single responsibility:** components only render and emit events; all changes go through pure functions in `state/appState.ts`.
- **Dependency inversion:** `App` depends on interfaces (`MapRenderer`, `CityDataSource`, `KeyValueStore`).
- **Lazy loading:** the city index (names, facts, climate) loads once; each outline file loads only when a city is picked.

---

## Security

- **Strict Content-Security-Policy:** everything comes from the site itself; the only third-party connection is Open-Meteo for live weather. `frame-ancestors 'none'` blocks clickjacking.
- **Other headers:** HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, COOP and CORP.
- **No HTML injection:** the DOM is built only with `textContent` and `setAttribute` via `h()`; ESLint bans `innerHTML`, `insertAdjacentHTML`, `document.write` and `eval`.
- **Untrusted input is validated:** URL parameters, `localStorage` and every JSON file are checked before use.
- **Privacy:** no cookies, accounts or analytics. Only city coordinates are sent to Open-Meteo, with `credentials: 'omit'` and `no-referrer`.
- **Supply chain:** one runtime dependency (MapLibre). Run `npm run audit:prod` in CI and commit the lockfile.

---

## Known limitations

- GHSL urban areas date from 2015 on a 1 km grid, so clipped outlines and metro areas look blocky when zoomed in and miss newer growth.
- Automatic boundaries are only as good as OpenStreetMap; spot-check the report, especially auto-clipped cities. Promote any city that needs hand-tuning into `cities.csv`.
- Vietnam abolished its district level in 2025; Hanoi, Ho Chi Minh City and Nha Trang may need `osm_id` overrides.
