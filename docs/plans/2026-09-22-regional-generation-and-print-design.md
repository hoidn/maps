# Regional generation and large-format printing

**Status:** Proposed design for the San Gabriel Mountains request; not an
implementation or release record.

The [implementation plan](2026-09-22-regional-generation-and-print-plan.md)
breaks this design into testable changes and real-artifact acceptance checks.

## Result

Add San Gabriel Mountains as the third geographic configuration alongside Grand
Canyon and Sequoia. Generate its standalone interactive HTML through the existing
portable pipeline, and use it to test acquisition, cached generation, rendering
and print export without place-specific renderer code.

Add single-page large-format PDF export for all three regions. Default to a
36 × 24 inch landscape sheet, with custom dimensions or a nominal map scale.
The PDF retains vector linework and text, embedded fonts and raster relief.
Place labels for the requested physical size rather than magnifying a screen
layout. Home-printer tiling is outside this first version unless requested.

The [data contract](../specs/map-data.md) owns geographic and artifact interfaces;
the [layout contract](../specs/map-layout.md) owns placement and freezing.
[Validation](../VALIDATION.md) determines the evidence required for each claim.

## Approach and scope

Extend `MapSpec`, the shared regional builder and existing Playwright tooling.
This reuses the installed source providers, SVG scene, label solver and static
audits. A third copied builder would introduce another cartography path; replacing
the authored Grand Canyon sheets with a new generic template would discard
editorial work beyond this request. Neither is needed.

Keep Grand Canyon's authored static and interactive composition and legacy terrain
adapter. Its print preparation uses the authored static builder; other regions
use `build_region.py` in static mode. Both feed one print preparation/export path.
Existing standalone HTML delivery and verified promotion remain supported.

## San Gabriel configuration and acquisition

Proposed frame: west −118.45, south 34.10, east −117.42, north 34.55. This is a
rectangular range overview, not a claim that the rectangle is the monument
boundary. Use the [Forest Service reference map](https://www.fs.usda.gov/sites/default/files/san-gabriel-mtns-nm-boundary-map-highres-20240502.pdf)
to review coverage, and source geometry for actual feature positions. Set natural
SVG dimensions to approximately match the frame's central metric aspect ratio.

Use the existing OSM, 3DEP, GNIS, 3DHP, PAD-US and Annual NLCD providers, caches,
registration checks and provenance. Review source-backed features around Mount
Wilson, Mount San Antonio, Mount Baden-Powell and the San Gabriel River to cover
developed access, summits, trails and water. Verify source spellings and geometry
before freezing expected-feature checks; do not substitute remembered coordinates.

Acquisition remains explicit. A cached build must never fetch. Missing essential
DEM or OSM caches produce an actionable error; missing supplementary sources
remain visible in the source inventory. Do not call an incomplete source set a
fully validated map. Larger-area provider failures must surface rather than
silently yielding an empty or partial scene.

## Build and test generalization

Extend the existing root build entry point with region selection instead of
adding another build wrapper. Its default retains the Grand Canyon build and
discovers other configured regions with available required caches. Selecting a
region explicitly requires its caches, without requiring unrelated Grand Canyon
inputs. Keep label bundling and static finalization in the established sequence.

Pass the selected `MapSpec` through regional construction and shared integration;
avoid reloading by ID and losing a caller's custom specification. Regional static
output must omit interactive controls, cursor data and interactive event handlers.

Parameterize regional audit/fuzz selection and add San Gabriel coverage scenes.
An unknown region or zero selected scenes is an error, not a successful empty
audit. Retain deterministic small fixtures for offline regression tests, and
separate their results from evidence for downloaded geography.

## Print behavior

Expose one root export command taking a map ID and output PDF path. Planned
interface examples, not currently installed commands:

```sh
npm run build:maps -- --map san_gabriel
npm run print:map -- --map san_gabriel --paper 36x24in --output artifacts/san-gabriel.pdf
npm run print:map -- --map san_gabriel --scale 50000 --output artifacts/san-gabriel-50k.pdf
```

`--paper` fits the complete map uniformly inside a fixed physical page, reserving
space for title, key, scale bars, attribution and map-use notice. It reports the
resulting nominal scale. `--scale` fixes the centre east-west scale denominator
and derives the necessary page dimensions. If both are supplied, reject a page
too small for that scale rather than shrink or crop without notice. Accept
positive finite dimensions in inches or millimetres; reject malformed values
and page sizes exceeding the verified export limit.

The existing affine longitude/latitude projection is retained. Label the ratio
as nominal at the centre latitude; report centre east-west and north-south scale
and variation across the extent. Do not claim an exact constant scale in every
direction. A printed calibration bar and an instruction to print at actual size
allow users to detect printer-driver scaling.

Use print typography in physical points and matching stroke/symbol sizes. Resolve
placement and detail eligibility at the target physical map size before freezing.
Select the contour tier from print ground scale, including its matching interval
in the key. Embedded raster pixels remain finite: report effective relief and
land-cover DPI and source ground resolution. Larger paper does not add terrain
detail; this change does not imply lidar processing or an arbitrary-resolution
terrain service.

### Printed map collar

The user specifically expects the legend and surrounding information of a
conventional printed USGS or National Geographic map. Provide a composed map
collar: the reserved area around the geographic map, including its border and
marginal information. Use the
[US Topo product standard](https://pubs.usgs.gov/publication/tm11B2) as a reference
for information hierarchy, while retaining this project's authored visual style.

- Title, regional subtitle and map edition/export date.
- A neatline (map border) with labelled latitude/longitude ticks at the edges.
- A compact legend generated from the actual printed styles and visible feature
  classes: roads/trails, facilities, water, land cover and land boundaries. Its
  swatches use the same stroke widths, dashes, fills and symbols as the map.
- Metric and imperial scale bars, nominal scale and its centre-latitude qualifier,
  plus contour interval and elevation units matching the printed terrain layer.
- A true-north arrow, horizontal coordinate/projection information, and vertical
  datum only when established by source metadata. Magnetic declination requires
  a verified dated calculation; do not invent a magnetic or grid-north diagram.
- Concise source credits, source date information, attribution, the existing
  map-use notice and actual-size printing/calibration instructions.

Lay out the collar at physical print sizes, keeping it legible and clear of map
labels and the trimmed page edge. Reflow its sections when paper dimensions
change; if the complete map and collar cannot fit at the requested scale and
minimum readable type sizes, report the required paper size. Do not clip the
legend or shrink its type to force a fit. This is conventional cartographic
presentation, not a claim of USGS product certification or National Geographic
affiliation.

Interactive UI, expandable source tables and long mileage tables do not consume
poster space. Detailed source records and hashes remain in the export report.
The authored standalone HTML continues to contain its existing editorial content.

## Freezing, PDF export and ownership

Extend static finalization with an explicit physical-layout reference size while
keeping its existing natural-size default. Do not change geographic frames or
invalidate acquisition caches merely to change paper size. Record the physical
page, map rectangle, typography profile and reference size in frozen metadata;
audit the serialized artifact at that same declared size without JavaScript.

Print preparation writes a staging HTML sheet; the existing finalizer freezes and
audits it. Playwright Chromium exports that frozen SVG sheet using explicit page
dimensions, print backgrounds and no browser headers/footers. Its
[PDF API](https://playwright.dev/docs/api/class-page#page-pdf) accepts physical
dimensions; use matching CSS page size and exact print colors to prevent implicit
fit-to-page scaling or print color substitution. Check loaded fonts,
page overflow and map bounds before writing a temporary PDF; validate the PDF's
page count and physical page size before atomic replacement. A failed export
preserves an existing destination. Keep reports and generated PDFs in ignored
`artifacts/` paths by default.

This is a deliberate extension of the frozen-static contract. Existing natural-size
HTML artifacts and Grand Canyon promotion destinations remain compatible. New
regional HTML candidates stay in `pipeline/` until a regional release profile
checks hashes, reviewed coverage and browser behavior; do not manually copy them
into `output/` or relax the existing pair's promotion checks.

## Verification and delivery

1. Add a failing regression for selecting a third region without Grand Canyon
   caches, passing custom specifications intact, and producing a static regional
   page without interactive handlers. Reuse existing Python/Node test harnesses.
2. Check physical unit conversion, nominal scale, fit/rejection, invalid inputs,
   raster DPI and destination preservation with focused deterministic tests.
3. Exercise frozen print output with JavaScript/network disabled in Chromium,
   Firefox and WebKit at its declared reference size. Verify PDF page dimensions,
   fonts, vector content, nonblank terrain and a measurable calibration bar using
   an independent PDF inspection tool. Verify collar completeness, legend-to-map
   symbol/style agreement, coordinate ticks, contour interval, minimum physical
   type size and absence of overflow. Rasterize and inspect the complete collar,
   poster and a representative text/terrain detail at print resolution.
4. Fetch San Gabriel sources, build its actual candidate, review the source
   inventory and expected geography, then exercise overview/dense scenes, both
   themes, narrow/wide viewports, zoom, pan, toggles and SVG/Canvas/WebGL rendering.
5. Export and inspect a 36 × 24 inch San Gabriel PDF and a 1:50,000 nominal-scale
   PDF. Confirm the same print path works for Grand Canyon and Sequoia; distinguish
   real-data checks from fixtures if their caches are unavailable.
6. Update the owning contracts and build/print operating documentation with the
   implemented commands and measured limits. Report actual validation results and
   missing evidence. Any tracked-map promotion requires its complete release gate.

Feasibility prerequisites: the current finalizer forces natural SVG dimensions,
and regional static mode still emits interactive controls/scripts. Physical-size
freezing, vector-preserving PDF export and larger-region live acquisition require
the executable checks above before they can be described as supported behavior.
Setup and source-cache availability are checked by the implementation plan;
neither source acquisition nor print-export validation is established by this design.
