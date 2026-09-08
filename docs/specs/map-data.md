# Map data contract

**Status:** Maintained contract for the existing pipeline, established 2026-09-08.
**Scope:** Coordinate/unit conventions, intermediate formats, and artifact
boundaries used by the current static and interactive builders. This document
does not approve the automatic-layout or lidar proposals.

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

The current geographic frame is west `-112.262`, south `35.990`, east `-111.898`,
north `36.232`. SVG dimensions are `1300 × 1070` user units. In
[osmdata.py](../../pipeline/osmdata.py), projection is:

```text
x = (lon - LON0) / (LON1 - LON0) * W
y = (LAT1 - lat) / (LAT1 - LAT0) * H
```

Fetch extents, DEM orientation, processor scales, and builder projection must
describe the same area. The existing processors hard-code geographic spans and
SVG dimensions; they do not read a shared frame configuration. Region changes
must account for these copies; see [Adapting](../ADAPTING.md#1-frame).

An ImageServer response can expand the requested extent. Pixel dimensions alone
are not proof of registration. The dense fetch checks returned bounds against
the request with a maximum discrepancy of `2e-4` degrees. Preserve that check;
the static fetch currently lacks an equivalent extent check. A changed geographic
registration needs evidence for the returned extent and samples in narrow terrain,
not just plausible elevations at broad trailhead locations.

Current raster-to-SVG contours use column × `1300 / width` and row × `1070 / height`.
Builder bilinear elevation sampling instead maps geographic bounds to indices
using `width - 1` and `height - 1`, then clamps at edges. These are existing,
different sampling conventions; do not silently substitute one during a refactor.
A pixel-center/edge alignment change requires a deliberate producer/consumer review.

## Artifacts and ownership

All intermediate and candidate paths in this table are relative to `pipeline/`.
The current scripts require that working directory.

| Producer | Artifact | Consumer or destination |
|---|---|---|
| `fetch_osm.py`, `fetch_osm2.py` | `osm.json`, `osm2.json` | `osmdata.py` and both builders |
| `fetch_dem.py` | `dem.tif`, `dem.npy` | Static processor/builder; `osmdata.py` diagnostic reads `dem.npy` |
| `fetch_dem_hi.py` | `dem_hi.tif`, `dem_hi.npy` | Interactive processor/builder |
| `process_dem.py` | `terrain.json`, light/dark JPEGs | `build_static.py` reads the JSON |
| `process_dem_hi.py` | `terrain_hi.json`, light/dark JPEGs | `build_interactive.py` reads the JSON |
| `build_static.py` | `grand_canyon_trails.html` | Reviewed candidate for `output/grand_canyon_trail_sheet_static.html` at repo root |
| `build_interactive.py` | `grand_canyon_trails_interactive.html` | Reviewed candidate for `output/grand_canyon_trail_explorer_interactive.html` at repo root |

Current fetched array shapes are `(1729, 2600)` for static and `(2592, 3900)` for
interactive, in `(height, width)` order. NPY files carry no geographic metadata;
their frame is implicit in code. Raw/intermediate data are ignored by Git. HTML
in `output/` is tracked, generated delivery content; lasting edits belong in the
builders. Validation precedes replacement of delivered files, and hosted
publication is separate. Automatic verified promotion is only a draft proposal.

Live refetching can change map content independently of code. When comparing a
data-sensitive rebuild, identify whether inputs were reused or refreshed; retain
source dates or hashes when needed to attribute a result to particular data.

## Terrain JSON

Both processors emit an object with `uri_light`, `uri_dark`, and `contours`.
The URI fields contain base64 JPEG data URIs. Each contour group is a list of
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

Builders consume these field names directly. There is currently no schema
version, shared validator, or embedded frame/provenance metadata.

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

## Known enforcement gaps

The static fetch does not verify returned extent; fetchers do not explicitly
enforce expected shape or a complete finite/no-data policy; terrain JSON has no
schema validator; frame constants are duplicated; source identity is not carried
through intermediates; output promotion is manual. There is no checked-in
automated regression suite. These gaps need scoped implementation work, not
stronger claims in documentation. The [layout draft](../plans/2026-09-08-automatic-map-layout-design.md)
proposes additional interfaces and checks but does not implement them.
