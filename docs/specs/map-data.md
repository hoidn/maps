# Map data contract

**Status:** Maintained contract for the existing pipeline, established 2026-09-08.
**Scope:** Coordinate/unit conventions, intermediate formats, and artifact
boundaries used by the current static and interactive builders. This document
does not define layout behavior or approve lidar proposals. The implemented
layout interfaces belong to the [map layout contract](map-layout.md).

Preserve these interfaces when changing a producer or consumer, or explicitly
update the contract and affected code together. Existing enforcement gaps below
are not claims of passing validation or requirements to repair unrelated code.
See the [index](../index.md) for routing and [validation guide](../VALIDATION.md)
for evidence appropriate to a change.

## Coordinates, frame, and units

| Boundary | Convention |
|---|---|
| USGS request bbox | `(west longitude, south latitude, east longitude, north latitude)`; request `bboxSR=4326`, `imageSR=4326` |
| Overpass bbox | `(south latitude, west longitude, north latitude, east longitude)` |
| Python points and trail chains | `(latitude, longitude)` in degrees; `P(lat, lon)` consumes this order |
| Projected SVG | `(x, y)`; x increases east/right, y increases south/down |
| DEM array | `[row, column]`; rows increase southward, columns eastward |
| Stored DEM elevations | Metres, `float32`; multiply by `3.28084` for feet at consumer boundaries |
| Contour levels, rendered elevations, tint stops | Feet; contour `lv` is not metres |
| `hav`, chain lengths, merge tolerance, table mileage | Miles |

The authored Grand Canyon frame is west `-112.262`, south `35.990`, east `-111.898`,
north `36.232`. SVG dimensions are `1300 × 1070` user units. In
[osmdata.py](../../pipeline/osmdata.py), projection is:

```text
x = (lon - LON0) / (LON1 - LON0) * W
y = (LAT1 - lat) / (LAT1 - LAT0) * H
```

Fetch extents, DEM orientation, processor scales, and builder projection must
describe the same area. The authored processors hard-code geographic spans and
SVG dimensions; they do not read a shared frame configuration. Changing that
adapter's frame must account for these copies. New regions use the shared
`MapSpec` path described in [Adapting](../ADAPTING.md).

An ImageServer response can expand the requested extent. Pixel dimensions alone
are not proof of registration. The dense fetch checks returned bounds against
the request with a maximum discrepancy of `2e-4` degrees. Preserve that check;
the static fetch currently lacks an equivalent extent check. A changed geographic
registration needs evidence for the returned extent and samples in narrow terrain,
not just plausible elevations at broad trailhead locations.

Raster-to-SVG contours use `(column + 0.5) × 1300 / width` and
`(row + 0.5) × 1070 / height`: marching-squares indices refer to sample centers,
matching the centers of the displayed PixelIsArea raster. This deliberately
corrects the former half-cell offset. Both cached GeoTIFFs were verified as
PixelIsArea and byte-equivalent in values to their `.npy` caches.
Builder bilinear elevation sampling instead maps geographic bounds to indices
using `width - 1` and `height - 1`, then clamps at edges. These are existing,
different sampling conventions; do not silently substitute one during a refactor.
A pixel-center/edge alignment change requires a deliberate producer/consumer review.

## Artifacts and ownership

All intermediate and candidate paths in this table are relative to `pipeline/`.
Individual Python stages require that working directory. Root npm commands and
build entry points establish it before invoking those stages.

| Producer | Artifact | Consumer or destination |
|---|---|---|
| `fetch_osm.py`, `fetch_osm2.py` | `osm.json`, `osm2.json` | `osmdata.py` and both builders |
| `fetch_water.py` | `water.json` | Shared `water_areas.py` adapter and both builders |
| `fetch_dem.py` | `dem.tif`, `dem.npy` | Static processor/builder; `osmdata.py` diagnostic reads `dem.npy` |
| `fetch_dem_hi.py` | `dem_hi.tif`, `dem_hi.npy` | Interactive processor/builder |
| `process_dem.py` | `terrain.json`, light/dark JPEGs | `build_static.py` reads the JSON |
| `process_dem_hi.py` | `terrain_hi.json`, light/dark JPEGs | `build_interactive.py` reads the JSON |
| `build_static.py` | `grand_canyon_trails.html` | Runtime-dependent staging input to `scripts/finalize-static.mjs` at repo root |
| `scripts/finalize-static.mjs` at repo root | `grand_canyon_trails_final.html` | Frozen candidate for verified promotion to `output/grand_canyon_trail_sheet_static.html` at repo root |
| `build_interactive.py` | `grand_canyon_trails_interactive.html` | Runtime-embedded candidate for verified promotion to `output/grand_canyon_trail_explorer_interactive.html` at repo root |
| `build_region.py --map ID` | `ID_trails_interactive.html`, `ID_trails_static.html` | Standalone regional candidate and static staging; selected caches come from the supplied `MapSpec` |
| `scripts/finalize-static.mjs` at repo root | `ID_trails_static_final.html` | Frozen regional candidate; outside the Grand Canyon promotion pair |

`npm run print:map` writes a PDF and sibling `.print.json` report under the requested
destination (default `artifacts/print/ID.pdf`, relative to the repository root). Unique
directories beside it hold print staging, frozen HTML and inspections; these are generated
artifacts, not source or tracked deliverables. The report binds staging, frozen and PDF
hashes, physical dimensions, effective raster DPI/sampling, sources/gaps and validation.
PDF replacement occurs only after successful checks. A failed final replacement restores
the previous sibling report. Printing does not fetch, replace files under `output/`, or publish.

`npm run generate:map` accepts selected WGS84 bounds and a title. It derives a validated
specification, including a central-geodesic aspect ratio and current portable source
defaults, and writes `pipeline/cache/ID/map.json`. A default ID combines a safe title slug
with a bounds hash; an explicit safe ID can retain an existing cache namespace. A
configured ID with a different frame is rejected before writing or fetching. This is
generated configuration, not a new required entry in `pipeline/maps/`. The command fetches,
builds and prints; `--cached` skips acquisition. Every consumer receives that actual spec,
and existing frame/hash checks still reject incompatible caches.

Current fetched array shapes are `(1729, 2600)` for static and `(2592, 3900)` for
interactive, in `(height, width)` order. NPY files carry no geographic metadata;
their frame is implicit in code. Raw/intermediate data are ignored by Git. HTML
in `output/` is tracked, generated delivery content; lasting edits belong in the
builders. Validation precedes replacement of delivered files, and hosted
publication is separate. The implemented `scripts/verify-maps.mjs` at repo root
verifies both candidates and promotes matching snapshots with rollback on a later
replacement failure. Use the [layout validation guide](../LAYOUT_VALIDATION.md)
for commands. **Release validation is pending**; implementation does not establish
that current delivered or hosted artifacts pass these gates.

Live refetching can change map content independently of code. When comparing a
data-sensitive rebuild, identify whether inputs were reused or refreshed; retain
source dates or hashes when needed to attribute a result to particular data.

## Terrain JSON

Both processors emit an object with `uri_light`, `uri_dark`, and `contours`.
The URI fields contain base64 JPEG data URIs. `hillshadeVersion: 4` identifies
compass-correct lighting with a neutral low-elevation palette and balanced relief contrast
in both themes. Version 2 corrected the compass calculation; version 3 changes
rendering style only. Version 4 restores shadow depth and restrains highlights
while keeping the neutral palette. A stale shading version triggers an image-only refresh
that preserves contours, smoothing metadata and registration. Both processors
use the shared `hillshade.py` calculation: array derivatives are eastward and
southward, while light azimuth is clockwise from north. Each contour group is a list of
records shaped as `{"lv": 2500, "d": ["M..."]}`: `lv` is elevation in feet,
and `d` contains SVG path strings in the shared map coordinate space.

- Static groups: `index` for 1,000-ft multiples and `inter` for the other 250-ft
  levels. Current generated levels run from 2,500 through 8,750 ft.
- Interactive groups: first assign 250-ft multiples to `index`/`inter`, then
  other 100-ft multiples to `fine`, then remaining 50-ft levels to `finest`.
  Current generated levels run from 2,300 through 8,550 ft.
- Each interactive elevation belongs to exactly one group. The explorer adds
  `fine` at 2× and `finest` at 4.5× to the base groups; do not duplicate base paths
  in the additional groups.

Interactive caches also carry `geometryVersion: 1`. The cached build regenerates
an older interactive terrain cache from `dem_hi.npy` before using it. This marker
versions geometry processing, not the full terrain schema.

Interactive contours and vector paths retain a maximum simplification tolerance
of 0.025 map units and three decimal places. At 14× zoom and natural sheet width,
the simplification plus rounding error is below half a pixel relative to the
source polyline. This is a rendering bound, not geographic accuracy; DEM sampling
and the elevation filter still limit the available terrain detail. Fine geometry is
retained at all zooms so camera changes cannot temporarily mismatch painted trails
and their collision obstacles. This raw-path tolerance is separate from the
bounded contour smoothing described below. Static contour simplification is
unchanged; its pixel-center registration is corrected as well.

Terrain caches mark `pixelRegistration: "center"`. Cached builds migrate legacy
corner-registered contours once, using the source grid dimensions. The interactive
cache additionally records a `smoothing` report with version, source grid,
maximum displacement, flattening tolerance and acceptance/fallback counts.
`smooth_terrain.py` applies bounded quadratic corner rounding to contours only,
after fine geometry extraction. Open endpoints and loop orientation are retained;
non-simple source or result paths retain the original geometry. Each corner's
rounding disk is limited to half the smaller source cell dimension and one quarter
of its distance to every other contour. Disjoint rounding disks preserve neighboring
contours and at least half their original gap. A rounding reserve covers coordinate
serialization. Curves are sampled to 0.008 map-unit chord error; bends already
within that tolerance retain their original vertices. Trails are never smoothed.

The smoothing version prevents repeated smoothing; a changed version requires
regeneration from the DEM. Smoothing and registration migrations replace caches atomically. Smoothing adds no elevation
samples and does not increase the geographic accuracy of the source grid.

Builders consume these field names directly. There is no shared validator or
embedded frame/provenance metadata.

## Vectors and geographic meaning

[osmdata.py](../../pipeline/osmdata.py) merges both Overpass `elements` lists by
`(type, id)`; later entries replace earlier entries. It assembles relation members
before loose named ways. Current endpoint merging uses a `0.03`-mile tolerance;
construction-tagged named ways are accepted. Preserve relation coverage and
coordinate order when changing fetch or assembly behavior.

A selected chain's orientation defines the origin of along-trail mileage. A
stop off that chain needs its own coordinate for elevation; the builders support
`("fixed", miles, coordinate)` to separate mileage from elevation location.
Do not replace that coordinate with the point at the same mileage on another bank.

Geographic feature positions and visual label offsets have different meanings.
Move annotations without silently changing source geometry. Existing mileage-based
approximations and curated placements are recorded in [Data sources](../DATA_SOURCES.md);
their existence does not make them surveyed positions. OSM tags, map appearance,
and layout validation do not establish current closures, water availability, or
field accuracy. Preserve attribution and the existing map-use notice.

## Embedded cursor elevation

The interactive builder resamples the dense DEM in feet to `(260, 390)`, rounds
and clips values to `0..65535`, and embeds row-major little-endian unsigned 16-bit
bytes as base64. Its JavaScript decoder reads that byte order explicitly and uses
the same geographic frame. Change encoder and decoder together. This reduced,
rounded readout is not the full-resolution bilinear sampler used by the tables.

## Embedded interactive contour geometry

Interactive builders may replace exactly representable contour `d` attributes
with empty source-path shells and an inert `map-contour-payload` JSON payload,
using the shared [ID/text interface](map-layout.md#inert-json-embedding).
Static output keeps contour paths inline; permitted scale-based omissions follow the
[frozen static contract](map-layout.md#frozen-static-artifact). Interactive packing preserves
path identity, attributes, group order, source attribution and map coordinates; it
does not simplify geometry. Unsupported path syntax remains inline unchanged.
The current encoder accepts absolute `M` polyline runs with exactly three decimal
places whose coordinates round-trip lexically at scale 1000 within signed int32.

Version 1 uses `encoding: "delta2-varint"`, `scale: 1000`, a total `pathCount`,
and tiers at zoom 0, 2 and 4.5 according to inherited contour detail classes.
Each tier records ordered shell IDs, coordinate count, byte count, CRC32,
`sourceSha256` and base64 `data`. The decoded byte stream starts with ASCII
`CTP1`, followed by unsigned varint path count. Each path contains its shell ID
and run count; each run contains its even coordinate count and alternating x/y
coordinates encoded as zigzag signed second differences. Both axis predictors
reset to zero at each run. Varints are canonical base-128, least significant
group first. `sourceSha256` hashes the original UTF-8 `d` strings joined with
NUL in tier order; it supports independent lossless-roundtrip verification.

The decoder validates ownership, tier membership, version, checksums, counts,
integer bounds and complete consumption before publishing decoded geometry.
CRC32 detects payload corruption; it is not an authenticity guarantee. Worker
transport failure runs the same dependency-free decoder cooperatively on the
main thread. No compression API, external request or extra package is required.
Malformed geometry is an explicit initialization/rendering error, never a
completed camera frame with missing visible contours. The owning
[layout interface](map-layout.md#interactive-controller) defines demand
preparation, native SVG hydration and controller readiness.

## Known enforcement gaps

The legacy static fetch does not verify returned extent; legacy fetchers do not
explicitly enforce expected shape or a complete finite/no-data policy, and their
terrain intermediates lack complete source metadata. Legacy frame constants are
still duplicated. The portable path below has separate frame, shape, sample and
hash checks; those checks do not retroactively establish legacy acquisition evidence. Automated layout tests, annotation manifests and
verified promotion now exist, but they do not close these geographic-data gaps.
Those gaps need scoped implementation work, not stronger claims in documentation.
The [map layout contract](map-layout.md) defines the separate rendering interfaces;
release validation of the generated pair remains pending.

## River water areas

`fetch_water.py` fetches OSM river-area ways and multipolygons into a separate
`water.json` cache, preserving existing trails and terrain when only banks need
refreshing. It uses `natural=water` + `water=river`, with legacy
`waterway=riverbank` support. See the [OSM river-area definition](https://wiki.openstreetmap.org/wiki/Tag:water%3Driver).
The explicit full build fetches this cache; cached builds never fetch it. Older
cache sets remain usable with an announced centerline-only fallback. To add
banks to such a checkout, run `../.venv/bin/python fetch_water.py` from `pipeline/`
then `npm run build:maps` from the repository root.

The shared adapter assembles member rings by node identity, handles reversed
fragments and inner islands, unions adjacent polygons, clips to the map frame,
and simplifies at 0.025 map units with topology preservation. Missing members,
unclosed rings and invalid polygons are errors, rather than invented banks.
Both builders paint opaque filled SVG water areas above terrain/contours and
below trails. Centerline strokes remain only outside mapped area coverage;
islands do not trigger a centerline fallback. These are mapped bank extents,
not a live water-level measurement. The 2026-09-08 cache contains OSM relations
253640 and 382232, tagged as originating from NHD; source angularity remains.

## Portable region catalogs (2026-09-09)

`MapSpec` owns the geographic frame for the portable path, loaded from a preset,
explicit JSON file or generated bounds. Grand Canyon retains the authored page
and legacy profile adapter; other regions use `build_region.py`. The builders consume the same feature and
style catalog. Geographic SVG coordinates remain affine longitude/latitude;
metric geometry operations use a local WGS84 azimuthal-equidistant CRS centered
on the configured frame. GeoJSON catalogs use longitude/latitude, unlike the
legacy Python `(latitude, longitude)` chain adapter.

Explicit acquisition is `pipeline/fetch_region.py --map REGION --source all`.
Individual provider refreshes are supported. Cached build commands do not fetch.
`cache/REGION/features.json` contains OSM physical features and separate route
memberships; `catalog.json` assembles national sources and records enrichment,
conflicts and omissions. IDs retain provider/type/object identity; equal names
do not merge physical segments. Untagged surface, difficulty, access and flow
remain unknown. Junction distances use WGS84 geodesics and actual OSM node
identity, not endpoint proximity. They have no river-mile stationing interpretation.

Raw source files have `.source.json` sidecars recording URL, provider, dataset
version, retrieval timestamp, AOI, attribution, bytes and SHA-256. Retrieval is
not survey currency. Derived raster metadata includes frame, shape, registration
and array hash. Portable terrain caches additionally depend on DEM hash and
contour-generator version. A same-frame DEM refresh invalidates its contours.

Portable OSM acquisition partitions the buffered frame and preserves complete way
and recursive relation dependencies. Every part uses the first response's declared
snapshot; older endpoint datasets, conflicting objects and missing dependencies
fail acquisition. Verified part checkpoints can resume an interrupted request at
that same snapshot. The final raw cache records every request and replaces a prior
cache only after the complete merge passes validation.

Portable DEM and Annual NLCD arrays are north-up PixelIsArea grids sampled at
cell centers. Terrain contours use `(column + .5) * mapWidth / rasterWidth` and
its row equivalent. NLCD acquisition reads the native EPSG:5070 edge lattice
from WCS metadata, requests aligned cells and uses nearest-neighbor category
sampling into the map frame. DEM exports validate service extent, dimensions
and missing samples, then explicitly resample onto the exact configured frame.
Legacy Grand Canyon elevation/profile sampling retains its documented adapter;
its authored stops and offsets are not moved by this addition.

The shared SVG scene is still the authored/static and measurement boundary;
Canvas paints interactive geometry and labels, with WebGL handling contours.
Candidate and promoted Grand Canyon artifact mappings above are unchanged.
`pipeline/sequoia_trails_interactive.html` is the portability validation candidate.
Local promotion still requires the complete release gate.

### Portable cache validation and compatibility

Map dimensions must be positive integers, query buffers finite and nonnegative,
and contour profiles exactly three descending positive integer intervals in feet.
Both coarser intervals must be divisible by the finest interval. The legacy
terrain adapter explicitly rejects a changed extent, map dimensions or contour
profile; use registered regional caches and `build_region.py` for those changes.
Its original elevation/profile sampling convention remains unchanged.

Every normalized national feature cache is an object containing `frame`,
`features` and `issues`, including empty results. The source refresh wrapper owns
this framing for GNIS, 3DHP and PAD-US. Bare lists and mismatched frames are rejected
by catalog assembly. Older unframed national caches must be regenerated from verified raw snapshots
or by the explicit refresh command; they are not reinterpreted under the current region.
The original OSM route/feature catalog already carries its frame.

Catalog assembly verifies retained raw-file hashes and any present regional DEM
or land-cover array hash, shape and dtype against their metadata. Land-cover
arrays must contain recognized integer categories and the configured extent.
The regional builder additionally requires float32 DEM values in metres, finite
valid samples, exact-frame PixelIsArea registration and pixel-center sample
locations. A same-shaped modified array is rejected when its recorded hash no
longer matches. Terrain cache keys include the verified DEM hash, geometry
version, frame and contour intervals; changing those inputs invalidates cached
contours. These checks establish cache consistency, not source survey accuracy.

`sourceInventory` records the configured expected providers, present cache sets
and missing cache reasons. `sourceIssues` retains national-adapter rejection
records and `sourceIssueCounts` gives per-source counts, including OSM issues. Missing optional source caches may still permit a build using remaining
sources; their absence must stay explicit. File availability is separate from
geographic completeness and currency. A legacy terrain adapter outside the
registered region catalog does not satisfy the registered-DEM provenance entry.
Provider refreshes are selected by `--source`; `all` refreshes all implemented
providers. No cached build acquires newer data implicitly.

Source sidecars separate `retrievedAt` from `datasetVersion`; unknown retrieval or
survey dates must not be invented. The NLCD `nativeGrid` and `nativeGridSource`
fields retain the WCS center/edge origins, native spacing, dimensions and hashed
grid-description source. Raster normalization records both native registration
and the final map frame. Polygon repair records distinguish ring repairs from
assembled multi-ring normalization and retain before/after areas. These records
are evidence of processing, not claims that an agency source was geographically
or legally corrected. See the [source limitations](../DATA_SOURCES.md#acquisition-evidence-and-remaining-coverage-limits).
