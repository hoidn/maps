# High-resolution maps: the 1 m lidar path

**Status:** Proposed high-resolution pipeline with a dated catalogue snapshot.
This is not an active implementation plan or a change to the current
[data contract](specs/map-data.md). See the [index](index.md) for other work.

The two maps in `output/` run on the USGS ⅓-arc-second grid (about 10 m cells), which is good
to 50 ft contours and a little beyond. For finer work USGS publishes 1 m lidar-derived DEMs
over this frame, and this file is the plan for using them. Nothing here has been built yet;
the catalogue lookup (`pipeline/fetch_dem_1m.py`) is tested, the rest is design.

## What exists (catalogue snapshot, 2026-09-06)

`python3 fetch_dem_1m.py` over the map frame returns 33 tiles, 4.8 GB, from six projects.
The listing is saved in `pipeline/tiles_1m.json`.

| Project | Tiles | Size | Published | Notes |
|---|---|---|---|---|
| AZ_GrandCanyonNP_2019_B19 | 16 | 2.66 GB | 2023-04 | Park flight; the only one that covers the inner canyon end to end. **Use this.** |
| AZ_NorthCentral_B23 | 5 | 474 MB | 2026-05 | Newer, Coconino Plateau side; may stop at the rim |
| AZ_NorthEast_D23 | 4 | 541 MB | 2026-06 | Newer, east edge of the frame |
| 2018 (unnamed project) | 5 | 905 MB | 2020-03 | Older, partial |
| AZ_NorthKaibabNF_2019_B19 | 2 | 91 MB | 2025-04 | North Rim forest |
| AZ_CentralCoconino_B22 | 1 | 96 MB | 2024-06 | South-west corner |

Tiles are 10 km squares in UTM zone 12N (EPSG 26912 / 6341), float32 GeoTIFF, metres, NAVD88.
The product's stated vertical accuracy is about 10 cm RMSE on open ground; on cliffs and
under vegetation it is worse, but still an order of magnitude better than the 10 m grid.

## What interval it supports

| Source | Cell | Finest useful interval | Where it helps |
|---|---|---|---|
| ⅓ arc-second | 10 m | 20–50 ft | current maps |
| 1 m lidar | 1 m (use at 2–3 m) | 5–10 ft | Tonto benches, rim plateaus, drainages, trail tread itself |

Cliff faces are solid ink at any interval, so the payoff is on the flatter ground where a
hiker actually reads contours: the Tonto Platform, Horseshoe Mesa, the Esplanade, the rims.

## Why it cannot be one file

Rough sizes for the whole frame (33 km × 27 km):

| Item | At 3 m | At 1 m |
|---|---|---|
| Grid | 11,000 × 9,000 cells, 400 MB float32 | 33,000 × 27,000, 3.6 GB |
| Hillshade JPEG | ~25 MB | ~200 MB |
| 10 ft contour paths (whole frame) | ~40 MB | ~100 MB+ |

The single-file explorer is 6.9 MB and already at the edge of comfortable panning. Everything
below assumes the high-res version is **tiled and hosted** (GitHub Pages, S3, any static
server), not a single artifact page.

## Build plan

1. **Download** the park project only: `python3 fetch_dem_1m.py --project GrandCanyonNP_2019 --download`
   (2.7 GB into `pipeline/dem_1m/`). Add the newer county flights later only if the park
   tiles show nodata gaps on the plateaus.
2. **Mosaic and reproject** to the sheet's lat/lon frame at 3 m (0.00003° ≈ 3.3 m N–S).
   GDAL is not installed on this machine; either `brew install gdal` and

   ```bash
   gdalbuildvrt mosaic_1m.vrt dem_1m/*.tif
   gdalwarp -t_srs EPSG:4326 -te -112.262 35.990 -111.898 36.232 -tr 0.00003 0.00003 \
            -r bilinear -of GTiff -co COMPRESS=DEFLATE mosaic_1m.vrt dem_3m_wgs84.tif
   ```

   or `pip install rasterio` and do the same with `rasterio.merge` + `rasterio.warp.reproject`.
   Check known elevations exactly as `fetch_dem_hi.py` does before going further.
3. **Hillshade and tint** with `process_dem_hi.py` unchanged in method, but written out as a
   pyramid of 512 px JPEG tiles (zoom levels 0–5 over the frame) instead of one image.
4. **Contours** per zoom tier, each cut on a grid smoothed to suit the tier so lines do not
   shimmer between levels:

   | Tier (zoom) | Grid | Ladder | Delivery |
   |---|---|---|---|
   | 1–2× | 10 m | 250 ft | inline, as now |
   | 2–4.5× | 10 m | 100 ft | inline, as now |
   | 4.5–8× | 3 m | 50 ft | tiles, 8×8 over the frame |
   | 8×+ | 3 m | 10 ft (index 50) | tiles, 16×16, loaded on demand |

   `find_contours` per tile on the 3 m grid with a one-tile overlap, then clip to the tile
   box; label only segments longer than 200 px at the tier's scale.
5. **Explorer changes**: keep the existing page as the shell. Replace the single `<image>`
   with a tile layer that swaps sources by zoom, and add a fetch-on-demand contour group
   that requests `contours/z{tier}/{col}_{row}.svgfrag` for tiles intersecting the viewBox
   and removes them when they leave it. Trails, labels and symbols stay inline; they are
   small. The URL hash view survives unchanged.
6. **Trail alignment**: OSM trail lines are good to a few metres, which is visible against
   3 m relief. Expect to nudge a handful of switchbacks by hand, or snap the line to the
   lidar-detected tread (a local minimum of slope across the trail) where it drifts.

## Time and cost estimate

Download 15 min; mosaic and warp 10 min; hillshade pyramid 5 min; 10 ft contours over the
frame at 3 m about 1–2 hours of CPU with scikit-image (or minutes with `gdal_contour`).
Output on disk roughly 150–250 MB of tiles. First-load for a viewer stays under 8 MB;
each zoomed viewport pulls 1–3 MB of contour fragments.

## Smaller alternative

If the goal is a printable high-res sheet of one area (Phantom Ranch to Havasupai Gardens,
say) rather than the whole frame, the current single-file pipeline handles it: set a frame
of about 6 × 5 km, request the 1 m data through the same 3DEP ImageServer at 2 m pixels (the
ImageServer serves the best available resolution, so a small bbox comes back lidar-derived),
and run `process_dem_hi.py` with a 10 ft ladder. That is a one-hour job with no new code.

## Implemented geometry retention (2026-09-08)

The interactive pipeline now preserves contours and OSM vectors at a 0.025-map-unit
simplification tolerance, with three-decimal coordinates. This replaces the old
0.3–0.45-unit simplification and one-decimal output. Fine geometry remains in the
SVG at every zoom, keeping trail paint, hit targets and collision obstacles
consistent. Terrain resolution, smoothing and contour intervals are unchanged;
this restores available vertices without adding lidar data or synthetic curves.

`npm run build:maps` automatically regenerates an old interactive terrain cache
from the local DEM. See the [terrain format](specs/map-data.md#terrain-json).

The same update keeps line widths and trail dash lengths constant with camera
zoom. At the checked desktop size a corridor trail measured 2.596 CSS pixels at
both 1× and 14×. The denser standalone candidate is approximately 35 MB (previously
9 MB). Python and unit suites passed, as did the three-browser geometry and stroke
checks. A 20-state Chromium smoke audit found no overlap, clipping, unknown-object
or typography errors; the existing coverage findings remain. The fresh benchmark
measured 7.3 ms transaction p95, 19.1 ms frame p95 and 149.5 ms settled latency;
the 100 ms settled target remains unmet. Reports and the inspected 14× screenshot
are in `artifacts/layout/zoom-quality-*` and `artifacts/layout/geometry-closeup-final.png`.
The candidate is `pipeline/grand_canyon_trails_interactive.html`; tracked delivery
files remain unchanged pending the release gate.

## Universal contour smoothing and registration

`contour_smoothing.py` rounds contour corners using quadratic curves bounded by
source cell size and neighboring contours. It works with the existing DEM and
requires no lidar coverage. The stored polylines approximate these curves closely
enough for the explorer's maximum zoom. Subpixel bends do not add points; unsafe
or non-simple paths retain their original geometry. Trail vertices are preserved.
See the [terrain contract](specs/map-data.md#terrain-json) for bounds and cache markers.

Inspection of the source GeoTIFFs confirmed PixelIsArea registration. The previous
contour projection omitted the half-cell offset between pixel corners and sample
centers; both processors and old-cache migration now account for it. The original
GeoTIFF values exactly match the cached arrays and contain no non-finite cells.
A georeferenced comparison at 69,122 locations found median absolute coarse/fine
difference 0.073 m, 95th percentile 1.255 m and RMS 0.830 m. This argues against a
large local-pipeline resampling error, but does not prove that upstream elevation
products contain no local artifacts. The particular location reported by the
user has not yet been identified. `artifacts/layout/grid-audit.json` records the
comparison. The temporary raster preview can still pixelate while moving; it is
replaced by the full SVG when the view settles.

Validation of the rebuilt candidate: 25 Python tests and 51 JavaScript unit tests
passed. Exact segment intersection checks found zero cross-contour intersections
among 2,546 generated paths. The 20-state Chromium smoke test found zero overlap,
clipping, unknown-annotation or typography findings; existing required-name and
coverage findings remain. The inspected 14× view is saved as
`artifacts/layout/smoothing-closeup.png`. The candidate is approximately 42 MB;
transaction p95 was 7.2 ms, frame p95 19.1 ms and settled latency 145.9 ms. The
100 ms settled target remains unmet, and tracked delivery files are unchanged.
