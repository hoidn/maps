# Handoff: Grand Canyon trail maps session (2026-09-06)

**Status:** Historical session record. Build/branch state, verification claims,
published links, and suggested priorities below describe that session, not the
current checkout. Start new work from [AGENTS.md](AGENTS.md) and the
[documentation index](docs/index.md); confirm current state before relying on this record.

One session, from "make a map of the Grand Canyon trails, draw it yourself" to two published
maps, a reproducible pipeline, and a product discussion. This file is the entry point for
the original session context, for a human or model.

## Delivered

| Item | Where | State |
|---|---|---|
| Static trail sheet (250 ft contours) | `output/grand_canyon_trail_sheet_static.html`, published at https://claude.ai/code/artifact/42c4a095-a978-40bc-8f8a-6871cb36f856 | done, 2.3 MB |
| Interactive explorer (250/100/50 ft contours by zoom, pan/zoom, layers, place finder, trail hover, cursor elevation, view in URL hash) | `output/grand_canyon_trail_explorer_interactive.html`, published at https://claude.ai/code/artifact/737ac0c0-65de-4c16-94b6-64a1641aba56 | done, 6.9 MB |
| Pipeline (fetch → process → build, both maps) | `pipeline/`, `run_all.sh` | runs end to end, ~5 min |
| 1 m lidar catalogue script | `pipeline/fetch_dem_1m.py`, `pipeline/tiles_1m.json` | listing tested; download untested |
| Docs | `docs/` (PROCESS, DATA_SOURCES, DESIGN, PITFALLS, ADAPTING, HIGH_RES, STRATEGY, AUTOMATION) | current |
| Git | three commits on `main`, nothing pushed, no remote | clean |

Both artifacts are private pages. The interactive one had a live-update watch armed in this
session; a second session of the same conversation was open for a while and has been quit.

## What happened, in order

1. Drew the sheet: USGS 3DEP DEM for a frame from Hermits Rest to Cape Royal, hillshade and
   geology-keyed tint computed from it, 250 ft contours, trails/rivers/roads/POIs from
   OpenStreetMap, hand-placed labels, mileage tables and a rim-to-rim profile.
2. Caught and fixed the elevation server silently stretching the grid (see PITFALLS #1), a
   missing charset, two wrong table elevations, and label collisions. Published the static sheet.
3. Added the interactive layer (viewBox pan/zoom, pinch, layer toggles, place finder, trail
   hover, embedded DEM readout). Published as a second artifact so the static one keeps its URL.
4. Asked whether finer contours were available: yes. Rebuilt the interactive map on a denser
   grid (3900×2592, fetched via the server's file link) with three nested contour ladders
   switched by zoom, scaled labels/symbols so they stay attached at zoom, and a shareable
   view hash. Republished.
5. Created this repo with the scripts, outputs and process docs.
6. Confirmed 1 m lidar coverage exists (33 tiles, 4.8 GB, park flight of 2019 covers the
   inner canyon); wrote the catalogue script and `HIGH_RES.md` with the tiled build plan.
7. Discussed value versus Gaia/NatGeo, monetisation, market size, differentiators, scaling to
   all locations, and how automatable the process is; recorded in `STRATEGY.md` and
   `AUTOMATION.md`.

## Owner's stated intentions (in their words, paraphrased where needed)

- "We'll want high res maps in the future" — the 1 m lidar path in `HIGH_RES.md` is the
  prepared route; 10 ft contours need a tiled, hosted build rather than a single page.
- "The interactive version should use much higher res since it has zoom" — done at the
  ⅓-arc-second level (50 ft at 4.5×+); the lidar level is the next step up.
- "I want mass market via app store or something" — recommendation recorded: Avenza Maps
  store first (georeferenced PDF, GPS for free, ~1 week), then a series of sheets, an own app
  only after sales validate.
- "It would be not just a series of parks but all marketable locations" — i.e. a generator,
  three tiers (hand-finished flagship routes, auto-generated long tail, GPX-to-sheet for
  users). Gate is automatic label placement.
- Asked "what would differentiate us from NatGeo" — sun-and-shade by hour was identified as
  the standout feature to build first.

## Known limitations and open issues

- Trail geometry is OpenStreetMap; lengths within ~3% of NPS figures, but the North Kaibab
  was `construction`-tagged, some viewpoints sit at bus stops, Santa Maria Spring's node is
  misplaced. A quality pass against NPS or field GPX is needed before selling anything.
- Resthouses are placed at 1.5 and 3.0 mi along the OSM line, not at the buildings.
- Label collisions were checked by eye on a few screenshot crops, not systematically; dense
  clusters (Salt/Horn/Cedar Spring camps, peaks near Phantom Ranch) have touching labels.
- Panning the interactive map at 5×+ with ~325 k contour vertices is usable, not smooth.
- Dark theme was built from tokens and never visually checked.
- The rim-to-rim profile assumes South Kaibab down, North Kaibab up; no other route profiles.
- `fetch_dem_1m.py --download` (2.7 GB) has not been run; GDAL/rasterio are not installed.
- Interactive pan/zoom, hover and readout were verified only by static screenshots
  (headless Chrome), never by hand in a browser; the Chrome extension was not connected.

## Suggested next steps, in order

1. Open both artifacts in a real browser and exercise the interactive controls; fix anything
   that headless screenshots could not show.
2. Systematic label-collision check on the static sheet (even a script that measures text
   boxes and prints overlaps) before any print or Avenza use.
3. Avenza export: rasterise the static sheet at 300 dpi, georeference with GDAL
   (`gdal_translate -a_ullr -112.262 36.232 -111.898 35.990 -a_srs EPSG:4326`), read the
   Avenza publisher guidelines, list it.
4. Sun-and-shade layer (horizon shadowing on the existing DEM, time slider in the explorer).
5. Automatic label placement per `AUTOMATION.md`, benchmarked against the current sheet.
6. Lidar build per `HIGH_RES.md` when a hosted, tiled version is wanted.

## How to resume the build environment

```bash
cd ~/Documents/grand-canyon-trail-maps/pipeline
pip install -r requirements.txt
./run_all.sh          # regenerates intermediates and both HTML files (~5 min, ~120 MB downloads)
```

Screenshot check: serve `pipeline/` with `python3 -m http.server 8765` and use headless
Chrome as shown in `docs/PROCESS.md` §4; append `#v=490,468,6` for a zoomed view.
