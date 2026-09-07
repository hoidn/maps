# Process: from raw data to the two maps

The pipeline is nine scripts run in order. Each one reads files written by the previous ones and
writes plain files, so any stage can be re-run alone. All paths below are inside `pipeline/`.

```
fetch_osm.py ─┐
fetch_osm2.py ┴─► osm.json, osm2.json ──► osmdata.py (module: chains, projection, POIs)
                                                │
fetch_dem.py ──► dem.npy ──► process_dem.py ──► terrain.json ──┬─► build_static.py ──► static HTML
                                                               │
fetch_dem_hi.py ──► dem_hi.npy ──► process_dem_hi.py ──► terrain_hi.json ──► build_interactive.py ──► interactive HTML
```

## 0. Decide the frame

Everything is keyed to one geographic frame, declared identically in `osmdata.py`, the fetch
scripts and the DEM processors:

```
LON0, LAT0, LON1, LAT1 = -112.262, 35.990, -111.898, 36.232
W, H = 1300, 1070      # SVG user units
```

Projection is plate carrée with the latitude scale stretched by `1/cos(36.11°)` so ground
distances are true in both axes. `osmdata.P(lat, lon)` converts to SVG coordinates. The
sheet height follows from the width: `H = W * (lat span * 1.2376) / lon span`.

At this frame 1 mile is about 64 SVG units, roughly 1:90,000 when the sheet is shown at full width.

## 1. Vector data (OpenStreetMap via Overpass)

`fetch_osm.py` posts one Overpass QL query for the frame: named paths/footways/tracks, all
rivers and streams, main roads, and point features (peaks, saddles, springs, campsites,
viewpoints, shelters, drinking water, places). It needs a real `User-Agent` header or
`overpass-api.de` answers 406.

`fetch_osm2.py` is a second pull for what the first cannot see: hiking `route` relations
(Tonto, Rim Trail, corridor trails) and every path inside the Bright Angel Canyon corridor
regardless of tag, because the North Kaibab Trail's main ways are tagged `highway=construction`
during the transcanyon waterline works.

`osmdata.py` loads both files, dedupes elements, and assembles trails:

1. Relation members first (`merge_coords`, joining ways whose ends fall within 0.03 mi).
2. Named ways for anything without a relation, including `construction`.
3. Roads as `(name, class, coords)`, streams by name, POIs as tagged nodes.

Helpers used everywhere downstream: `hav` (haversine miles), `length`, `chain_near(name, lat,
lon)` to pick a specific chain, `longest(name)`, `poi(name)`.

Running `python3 osmdata.py` prints every chain's length and endpoint elevations; check that
the trails you care about come out as single chains of the expected mileage before building.

## 2. Terrain (USGS 3DEP)

`fetch_dem.py` asks the 3DEP ImageServer `exportImage` endpoint for a float32 GeoTIFF of the
frame at 2600×1729 pixels (about 12.6 m per cell). `fetch_dem_hi.py` does the same at
3900×2592 for the interactive map, but requests `f=json` and downloads the returned `href`
because the inline image path fails above about 4.5 megapixels. Both print elevations at
known points (Phantom Ranch, the trailheads) so a misaligned grid is obvious immediately.

**The pixel grid must be square in degrees** or the server changes the extent without telling
you. See `PITFALLS.md`. The check is built into `fetch_dem_hi.py`.

`process_dem.py` / `process_dem_hi.py` turn the grid into page assets:

- **Hillshade**: gradient of a lightly smoothed grid, blended from four light directions
  (315° dominant) with 1.15× vertical exaggeration, normalised to the 99.5th percentile.
- **Hypsometric tint**: a piecewise ramp in feet that follows the canyon's rock units (dark
  schist in the gorge, grey-green Tonto shelf, red Supai and Redwall, pale Kaibab rim, forest
  green above 7,500 ft). One ramp for light theme, one for dark; both multiplied by the
  hillshade and saved as JPEG (quality 72–76, chroma subsampling) then base64-encoded.
- **Contours**: `skimage.measure.find_contours` on a Gaussian-smoothed grid (σ 1.4–1.6 cells),
  simplified with Douglas–Peucker at about half an SVG unit, emitted as `M x,y x,y …` path
  strings scaled into SVG space. The static build uses one ladder (250 ft, index 1,000 ft).
  The interactive build writes four groups: `index` (1,000), `inter` (other 250s), `fine`
  (100-ft levels not on the 250 ladder) and `finest` (50-ft levels not on the 100 ladder), so
  the three visible ladders nest without duplicated lines.

Output is one JSON file with the two image data URIs and the contour path strings.

## 3. Assemble the sheet

`build_static.py` and `build_interactive.py` are the same program at two stages; the
interactive one grew out of the static one and adds a UI layer. Reading order inside either:

1. **Helpers**: `clip_runs` splits a chain into the pieces inside the frame (plus one point
   past each edge), `d_of` simplifies and formats a path, `along`/`point_at` measure distance
   along a chain, `trail_label` places rotated text along a straight stretch.
2. **Data selection**: named chains are pulled and oriented (`orient(chain, start_near)`) so
   mile 0 is the trailhead. The Tonto Trail is split by longitude into threshold and primitive
   sections.
3. **Layers**, drawn bottom-up: terrain image → contours → contour labels (textPath on the
   longest index segments) → hydrography → roads (casing + fill) → trails by class → region
   names → stream labels (textPath) → peaks → symbols → trail names → place labels → cartouche
   and scale bar → neatline.
4. **Hand-placed labels**: the `place()` calls are the editorial layer. Each is a symbol kind,
   a coordinate (from OSM where it has one), the text, and an offset/anchor chosen to avoid
   its neighbours. Resthouses are placed by distance along the Bright Angel Trail (1.5 and
   3.0 mi) because OSM has no node for them.
5. **Tables and profile**: mileages are measured along the chains, elevations sampled from the
   grid (bilinear). The rim-to-rim profile concatenates the South and North Kaibab chains and
   samples every 0.02 mi, smoothed over five samples.
6. **HTML**: CSS tokens for light/dark, the figure, legend, tables, profile SVG, notes, and a
   script for the profile hover.

`build_interactive.py` additionally:

- gives each trail path `data-name`, `data-cls`, `data-mi` and adds an invisible wide "hit"
  copy for hover and click;
- wraps every symbol and label in a CSS transform `translate(x,y) scale(var(--k)) translate(dx,dy)`
  so offsets shrink with zoom and labels stay attached to their markers;
- scales line weights with `--s` and textPath font sizes with `--k` (both set from zoom as
  `zoom^-0.5` and `zoom^-0.55`);
- embeds a 390×260 uint16 copy of the DEM for the cursor elevation readout;
- collects `PLACES` for the "Go to" menu;
- writes the pan/zoom script: viewBox manipulation, wheel and pointer events with pinch,
  zoom classes `z2`/`z5` that reveal the finer contour groups, and `#v=x,y,zoom` in the URL.

## 4. Check the render once

Neither build was iterated blind. After each build the page was served locally
(`python3 -m http.server`) and screenshotted with headless Chrome:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --hide-scrollbars --window-size=1400,3300 --virtual-time-budget=8000 \
  --screenshot=shot.png "http://127.0.0.1:8765/grand_canyon_trails.html"
```

For the interactive page append `#v=490,468,6` to the URL to screenshot a zoomed view. Crop
the PNG into regions with Pillow and look for label collisions, wrong offsets, garbled
characters and misplaced trail names; fix them in the `place()`/`trail_label` calls and rebuild.

## 5. Publish

The HTML files were published as Claude Code artifacts (private pages). Any static host works;
the page has no server dependency. Keep the two files under separate names so the static sheet
and the explorer keep their own URLs.
