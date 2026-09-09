# Adapting the pipeline to another area

**Role:** Guide to changing the current region-specific scripts, not an
implemented general map generator. Preserve the [data contract](specs/map-data.md)
and use the [validation guide](VALIDATION.md) for the affected outputs.

The scripts are specific to the Grand Canyon frame in three places: the frame constants, the
OSM trail names, and the hand-placed labels. Work through this list in order.

Before releasing another area, update required names/routes in `label_manifest.py` and
`pipeline/labels/policy.json`, register every new annotation class and provide real source
geometry for path labels. Declare allowed line breaks rather than inventing abbreviations.
Re-evaluate and freeze scene coverage minima; do not inherit Grand Canyon thresholds blindly.
Run the full [layout validation](LAYOUT_VALIDATION.md), including frozen static output and
actual-map performance. Automated placement does not validate the new area's source data.

## 1. Frame

Set `LON0, LAT0, LON1, LAT1` identically in `osmdata.py`, `fetch_dem.py` and `fetch_dem_hi.py`.
The processors do not declare those bounds: `process_dem.py` and `process_dem_hi.py`
hard-code `0.364`/`0.242` for geographic spans, `36.111` for latitude, and `1300`/`1070`
for SVG dimensions. Update those consistently with the new frame. Recompute:

- `H = W * ((LAT1-LAT0) / cos(mid latitude)) / (LON1-LON0)` for the SVG frame.
- DEM `size`: pick a width, then `height = width * (LAT1-LAT0) / (LON1-LON0)` so pixels are
  square in degrees. Confirm with `f=json` that the returned extent matches.
- The `MI` scale constant in the builders uses `0.017888°` per mile at 36.1° N; replace with
  `1 / (69.172 * cos(mid latitude))`.

Outside the US the 3DEP service has no coverage; swap in Copernicus GLO-30 (30 m, worldwide) or
a national lidar product and read it with `rasterio`. The rest of `process_dem.py` only needs a
2-D array in metres and the frame.

## 2. Vector pull

Edit the bounding boxes and region-specific relation filters in both Overpass queries.
Run `fetch_osm.py` and `fetch_osm2.py`; `python3 osmdata.py` also requires `dem.npy` for
its endpoint-elevation diagnostic. Read the chain summary. For each trail you want:

- Is it one chain of the right length? If not, look for a route relation and add its name to
  the regex in `fetch_osm2.py`, or check for odd tags (`construction`, `abandoned`, unnamed).
- Does the summary show sensible elevations at both ends? Wrong ends mean a misaligned DEM.

## 3. Builder data selection

In `build_static.py` / `build_interactive.py`, the block after `# data selections` names every
chain (`BA`, `SK`, `NK`, `TONTO_W` …) and orients it with a start coordinate. Replace these
with your trails. The class lists under `trails_svg` decide line style; the `tonto_class`
splitter shows how to vary class along one chain.

## 4. Hypsometric ramp

The ramps in `process_dem*.py` are in feet and tuned to canyon geology. For alpine terrain
use a conventional green → tan → grey → white ramp; for lowlands compress the range. Keep the
dark-theme ramp darker than the light one rather than inverting it.

## 5. Labels

Delete the `place()`, `L(...)`, `REG` and `TL` entries and start again. Order of work that
proved efficient:

1. Trailheads and the biggest destinations.
2. Campgrounds and water.
3. Trail names on straight stretches (`trail_label(chain, mile_from, mile_to, …)`).
4. Peaks from OSM (`natural=peak` with `ele`), with a `PEAK_LEFT` set for those that collide.
5. Region names last, at low opacity.

Render, screenshot, crop into quadrants, fix collisions, render again. Two passes were enough
here.

## 6. Tables and profile

`stops_table` takes `(name, target, note)` where target is `"start"`, `"end"`, a mile as
float, a coordinate (nearest vertex), or `("fixed", miles, coordinate)` for stops off the
measured chain. The profile concatenates chains; make sure each is oriented so its start
touches the previous chain's end, and choose `WP` waypoints near the line.

## 7. Contour intervals

`process_dem_hi.py` builds ladders from `range(2300, 8600, 50)`. Change the bounds to your
elevation range and the step to the finest interval you want; the modulo tests decide which
ladder each level joins. Adjust the zoom thresholds (`z>=2`, `z>=4.5`) in the builder's
`apply()` to taste. Expect roughly 0.6 MB of path data per 250 ft ladder over a 1300×1070
frame with canyon-scale relief; gentler terrain is far cheaper.

## 8. Going finer than 50 ft

Check `pipeline/fetch_dem_1m.py` (edit its frame first) for 1 m lidar coverage. If it exists,
`docs/HIGH_RES.md` has the tiled build plan; for a small inset the ImageServer path in
`fetch_dem_hi.py` with a ~5 km bbox at 2 m pixels is enough and needs no new code.

## 9. Sanity checks before publishing

- Known elevations at two flat points and two narrow ones (ridge, canyon floor).
- Trail lengths within ~5% of published figures.
- A zoomed screenshot (`#v=x,y,6`) for the interactive page.
- Both themes: toggle `data-theme="dark"` on `<html>` in devtools.
- Attribution for OSM (ODbL) and USGS present in the footer.

## Portable configured builds

The portable path uses `pipeline/maps/REGION.json` rather than editing geographic
conditions in classifiers. `MapSpec` selects the frame, title, contour intervals,
source set and expected editorial names/routes. From `pipeline/`:

```sh
../.venv/bin/python fetch_region.py --map sequoia --source all
../.venv/bin/python build_region.py --map sequoia --renderer webgl
```

Fetching is explicit; repeat builds use `cache/sequoia/` without network requests.
The same scene/style code augments the authored Grand Canyon sheets. Its historical
profile, stops and explanatory page composition remain a separate editorial
adapter. Do not substitute label offsets for geographic feature positions.

Use the portable coverage scenes and seeded visual fuzzer in addition to source
inventory checks. Review equivalent metres per pixel across parks; equal raw zoom
factors need not represent equal ground resolution. The Grand Canyon release pair
continues to require its existing full release and promotion commands.
