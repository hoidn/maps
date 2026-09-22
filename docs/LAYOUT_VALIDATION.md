# Automatic map layout and release validation

The Python builders emit geographic anchors, stable annotation and feature IDs, path references,
priorities, required-name groups and declared word-preserving line breaks. The browser measures
the embedded fonts and rendered SVG geometry in CSS pixels. The placement solver reserves
space for controls and protected trail strokes, tries bounded alternatives, and records an
outcome for every annotation. Hiding optional labels is an explicit outcome; required static
names must remain visible. A symbol does not satisfy a name requirement.

The interactive controller owns camera, layer and label changes. The static finalizer bakes
positions into HTML at the declared natural map size (or physical print size) and checks the serialized file again
with JavaScript disabled. Shared cartography supplies source geometry, independent land cover
and neutral relief, ground-scale styling, and label candidates to the builders. Area labels
respect supplied polygon boundaries, including holes; the system does not infer boundaries
from a name or move geographic features to make labels fit. These implementations are installed;
candidate release validation and promotion remain pending.

## Setup and commands

Use Node 24, the pinned dependencies in `package-lock.json`, and the Python requirements.
Browser binaries live in the ignored `.browser-cache/` directory. The pinned Playwright version
supports the macOS version used for development; changing it requires rerunning the matrix.

```bash
npm ci
npm run browsers:install
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
npm run build:labels
npm run test:unit
.venv/bin/python -m unittest discover -s tests/python
npm run test:browser
```

`pipeline/run_all.sh` explicitly fetches and processes Grand Canyon OSM, USGS and other
agency inputs. Once caches
exist, `npm run build:maps` performs a build without fetching. Missing caches are listed before
any build starts. `MAP_PYTHON` can select an existing Python environment. Both build routes
write candidates into `pipeline/`; neither replaces delivered maps.

The cached build emits `grand_canyon_trails_interactive.html` with WebGL contours and Canvas
relief/foreground, `grand_canyon_trails_canvas.html` for comparison, and the frozen
`grand_canyon_trails_final.html` after static finalization. Other configured regions with
feature and DEM caches also get interactive, static staging and frozen static candidates.
The standard verify/promote pair covers the Grand Canyon static and interactive candidates;
it does not promote the Canvas companion, regional candidates or PDFs.

```bash
npm run build:maps
npm run verify:maps
npm run promote:maps
```

The final command revalidates immutable candidate snapshots before replacing either file in
`output/`. Both candidates must pass, hashes must still match, and a failure replacing the
second file rolls the first back. This is local promotion only; hosted pages are not published.
Do not replace `output/` with manual copies that bypass the checks.

Browser modes are explicit and default to headless. For performance on a local GPU,
run `node scripts/benchmark-layout.mjs --input pipeline/grand_canyon_trails_interactive.html
--report artifacts/layout/performance-headed --headed` (as one shell command).
`--headless` overrides `HEADED=1`; otherwise that environment variable also selects
headed performance runs. The baseline, when supplied, uses the same launch mode.
Reports retain the requested mode, launch options, browser version, CPU/OS and actual
Chromium GPU renderer/device/feature evidence. `environment.json` is written before
map navigation, so an interrupted benchmark still retains its launch environment. A headed window alone does not prove
hardware acceleration: check the reported renderer. SwiftShader results describe
software rendering and must not be compared as if they were Apple Metal timings.

The full gate accepts `npm run verify:maps -- --performance-headed` (and the same
option for `promote:maps`). `--performance-headless` explicitly selects a headless browser; its GPU evidence
still determines whether it uses hardware or software rendering. Correctness scenes
remain headless unless `--scenes-headed` is supplied; `--scenes-headless` restores the
default. These scene options preserve all 36 profiles, states and checks, and record
the actual mode/GPU in the report. Direct `scripts/release-scenes.mjs` invocations
use `--headed` or `--headless`; `HEADED` does not change scene mode. Frozen static
checks remain headless with JavaScript disabled. Switching launch mode does not
relax the 8 ms/33 ms performance limits or establish that any release gate passed.

## Regional builds and large-format PDFs

This route produces an interactive regional candidate, frozen static HTML, and a single-page
PDF with its legend and map collar. The [data contract](specs/map-data.md#artifacts-and-ownership)
owns the artifact boundaries; the [print layout contract](specs/map-layout.md#physical-print-profile)
owns physical dimensions and nominal scale.

1. Use Node 24 and Python 3. Install Poppler (`pdfinfo`, `pdffonts`, `pdftoppm`) and MuPDF
   (`mutool`) using your system package manager. On Debian/Ubuntu these are `poppler-utils`
   and `mupdf-tools`. Playwright also needs its browser system libraries; its install command
   below installs the browser binaries, and `npx playwright install-deps` installs Linux
   system dependencies where permitted.
2. Run this sequence from the repository root. Fetching contacts USGS and Overpass;
   source caches can exceed hundreds of megabytes and large-area queries can take many
   minutes. The fetcher retains completed provider caches and verified OSM partitions.
   A retry resumes those partitions. For a provider-only retry, run `fetch_region.py` from
   `pipeline/` with the generated spec path and its `--source` name; its `--help` lists choices.
3. Open the PDF and its sibling `.print.json` report. Inspect the complete sheet, dense
   trails and collar at actual size. Print at 100%, with fit-to-page disabled, and measure
   the calibration bar before relying on the nominal scale.

```bash
set -e
MAP_ID=san_gabriel
TITLE="San Gabriel Mountains"
BBOX=-118.45,34.10,-117.42,34.55
PAPER=36x24in
PRINT_DIR=artifacts/print

npm ci
npm run browsers:install
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
npm run generate:map -- --title "$TITLE" --bbox="$BBOX" --id "$MAP_ID" --paper "$PAPER" --output "$PRINT_DIR/$MAP_ID.pdf"
pdfinfo "$PRINT_DIR/$MAP_ID.pdf"
```

- Generation derives a region specification and its geodesic aspect ratio from the title
  and bounds, then stores it under `pipeline/cache/MAP_ID/map.json`. No checked-in spec is
  needed. Omit `--id` to derive a safe ID from title/bounds; add `--cached` to reuse inputs.
- Acquisition registers and hashes inputs under `pipeline/cache/`. Individual build/print
  commands reuse inputs without fetching and accept either a preset ID or an explicit
  generated JSON path. The authored Grand Canyon preset additionally needs the legacy
  inputs produced by `pipeline/run_all.sh`.
- The cached regional build writes `pipeline/MAP_ID_trails_interactive.html`, static staging
  HTML and `pipeline/MAP_ID_trails_static_final.html`. Its explicit map selection does not
  require another region's caches.
- Printing stages and freezes HTML in a unique directory beside the requested PDF. Its
  report links that HTML and the inspection directory. Six browser/theme audits reopen
  the exact frozen bytes without JavaScript; print paint stays light in dark environments.
- PDF checks require one correctly sized page, embedded fonts, vector paths and text inside
  the map, retained relief pixels, and a rasterized 100 mm bar. Failed checks preserve an
  existing PDF. An ordinary browser print dialog does not run these checks.

The default is 36 × 24 inches. `--paper` accepts inches or millimetres, such as `914.4x609.6mm`.
Replace it with `--scale 50000` for a derived nominal 1:50,000 sheet. Supplying both requires
the map and measured collar to fit; the exporter rejects overflow instead of shrinking.
The tested page cap is 96 inches per side; the fixture checks include 96 × 60 inches.
Home-printer tiling is not implemented.

Scale is nominal east–west at the frame's centre latitude. The geographic affine frame is
preserved; the report gives north/south and north–south variation. Regional contour detail
comes from its available tiers; authored Grand Canyon printing retains 250 ft contours.
The report separates embedded raster DPI, normalized sample spacing and known native
resolution. Low DPI terrain is not converted into high-resolution terrain by enlarging
the page. Source retrieval dates do not establish survey currency or current access.

Regional coverage uses `scripts/audit-cartography.mjs` and
`scripts/fuzz-cartography-matrix.mjs --map san_gabriel`. The shared comparison scenes
use 32, 12 and 6 m/pixel. The audit rejects a clamped requested scale; the San Gabriel
frame cannot reach 3 m/pixel within the existing 14× zoom limit. Coverage marked pending
requires visual review; an unavailable requested backend is reported as incomplete. Printing never
promotes tracked HTML or publishes hosted pages.

## What the gates establish

- Every rendered map label and symbol has manifest ownership. Unknown annotations fail.
- Rendered label footprints do not overlap one another, protected trails or controls, and
  respect the declared map edge. Typed local symbol-anchor relationships are the only
  geometric exceptions. Separate facilities at the same place still require separation.
- The static sheet retains all nine required corridor place names and one name for each of
  Bright Angel, South Kaibab and North Kaibab Trail. Missing required names fail finalization.
- Interactive layers, search, camera restoration, tier transitions and moving frames are
  checked in addition to settled views. Hidden directory features remain selectable.
- Frozen output is checked in Chromium, Firefox and WebKit, light and dark themes, without
  JavaScript or external font/network access. Font assets and OFL notices are checked in.
- Release scenes cover phone, tablet and desktop widths, DPR 1/2, fractional zoom boundaries,
  dense areas, seeded random states and paint-aligned gesture frames.
- Performance is measured separately from correctness, including rendering the real contour
  map. Schema 2 reports enforce the configured camera limits: 8 ms p95 warm transaction work
  and 33 ms p95 frame interval under the provisional reference profile. Labels must eventually
  complete with a ready state; errors, missing measurements and unfinished work cannot pass.
  `settledMs` is informational: it includes the 120 ms wheel quiet period, animation frames and
  progressive idle label preparation. There is no 100 ms settled-layout gate. Unmet camera
  limits must be reported, not hidden by suppressing labels.

Independent audit code lives under `tests/support/`; it remeasures final DOM geometry and
uses a separate pairwise reference. It does not accept the solver's success flag as proof.
The read-only legacy adapter remains available for comparing the original maps:

```bash
npm run audit -- --input output/grand_canyon_trail_sheet_static.html --mode managed --no-js --report artifacts/layout/static-audit
```

Reports under `artifacts/layout/` record artifact, font and policy hashes, browser versions,
view geometry, coverage, collisions, clipping and screenshots. Development reports are ignored
by Git; a release summary should record the tested artifact hashes and actual performance.
Tests of promotion deliberately fail audits, mutate candidates and simulate a second-file
replacement failure to verify that delivered bytes are preserved.

## Reviewed overview coverage

The [release-scene fixture](../tests/fixtures/layout-scenes.json) freezes the Grand Canyon
coverage expectations described in the [reviewed destination baseline](cartography/expected-destinations.json).
At viewport widths of at least 1200 CSS pixels, at least 80% of the fixed 30 destinations
must have a visible name, and all nine required core destinations must have a visible name.
A destination counts once when any of its listed equivalent point-label IDs is visible;
a symbol alone does not count. Missing annotation IDs do not reduce the denominator.
The existing overview minimum of eight point labels and all dense-scene minima remain unchanged.

This deliberately replaces the proposed acceptance fraction over raw primary annotations.
The raw numerator and denominator remain in every report's `coverageByClass` diagnostic.
Editorial labels, OSM nodes and mapped areas can describe the same destination, so requiring
80% of those separate annotations could penalize correct suppression of duplicate names.
The reviewed baseline uses all nine configured core destinations, all 17 other pre-existing
authored trailhead/camp destinations, and four source destinations selected for geographic
spread before individual visibility was measured. Equivalents require matching purpose and
name plus geographic evidence; nearby different destinations remain separate. These are
validation identities, not production filters or geographic corrections.

The preliminary Chromium 1440 × 1000, DPR 1, light-theme overview of candidate
`298de3449c066ba1e2ddc61e261cfbf59c97ad88bcefbd04548d097c841ac550`
represented 26/30 destinations (86.7%) and 9/9 core destinations. North Rim Campground,
Cape Final campsite, Horn Creek campsite and Cape Final trailhead were absent. Raw primary
annotation coverage was 42/67 (62.7%). The screenshot covered the browser viewport, leaving
the southern map below the fold; it was not a full-sheet visual review. Duplicate destination
names remained visible in some places. These results do not guarantee visibility of every
primary catalog feature, every facility, or every geographic destination.

`coverageReview: "frozen"` records review of the membership and floors, not completion of the
release matrix. Final immutable candidates still require the full all-engine, viewport, DPR,
theme, interaction and geometry gates before promotion. The regional source/scene inventory
in [coverage-baselines.json](cartography/coverage-baselines.json) has a separate scope and does
not establish a Sequoia destination-visibility guarantee from this Grand Canyon fixture.

For arbitrary interactive camera states, an in-frame point anchor above its detail
threshold does not guarantee room for its name: the frame, fixed controls and other
geometry can exclude every permitted placement. The independent geometry audit therefore
does not impose an unconditional one-point-name minimum on random views. This deliberately
replaces its former `interactive-visible-point-name` failure. Static required names/routes,
declared scene minima and the reviewed destination floors above remain acceptance checks.
Compact audits and fuzz captures retain `pointNameCoverage`: eligible and visible counts,
all missing eligible point-label IDs, and `reviewRequired` when none of the eligible point
names paints. Every flagged state requires screenshot/outcome review; a successful fuzz
geometry status alone does not complete that review. This diagnostic is not a waiver for
missing destinations in a scene with declared expectations.

## Additional cartography and startup evidence

The [ground-scale audit](../scripts/audit-cartography.mjs) records source/catalog/scene/paint
coverage for configured scene profiles and produces screenshots for review; unknown or empty profiles fail. Its
`review-required` status is not a release pass. The [seeded interaction fuzzer](../scripts/fuzz-cartography.mjs)
exercises camera gestures, text size, layers, themes and resizing, checks eventual completion
and painted-camera agreement, and writes a replayable report plus a contact sheet. These
diagnostics supplement the independent collision audits and release scenes.

Run browser workloads sequentially from the repository root, for example:

```bash
PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/audit-cartography.mjs pipeline/sequoia_trails_interactive.html artifacts/cartography/sequoia-audit.json chromium
PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/fuzz-cartography.mjs pipeline/grand_canyon_trails_interactive.html artifacts/cartography/fuzz-grand-canyon 73191 36 chromium webgl
```

The [startup investigation](STARTUP_INVESTIGATION.md) owns the current measurement method and
reproduction commands for the 3× initial-responsiveness target. Warm camera gates, initial
layout readiness and completed-draw input latency are distinct claims. The current startup
target has not been established as passing.

## Limits

A finite test matrix alone cannot prove behavior at every real-valued zoom. The synchronous
runtime validity check enforces the supported geometric rules for displayed states; randomized
and transition tests look for implementation defects. Browser font shaping, glyph bounds and
sampled curved paths require conservative envelopes and cross-engine verification.

Static validity applies at the declared natural map size, or at the resolved physical
rectangle for a print profile, and uniform scaling of the frozen scene. Arbitrary responsive print reflow, new fonts, third-party CSS, different projections or
new annotation classes require new validation. The physical PDF path additionally inspects page dimensions, embedded fonts, map-interior
vectors/text, terrain pixels and a calibration bar; it does not certify every glyph outline. Human review remains useful for composition and geographic meaning; collision
checks cannot verify OSM positions, water availability, closures, route continuity or safety.


Interactive release audits explicitly load every face in the declared required font
families before collecting a settled inventory. This exercises embedded bytes even
when a style is currently hidden, and restores WebKit font-face status after screenshot
stylesheet synchronization. Missing families and failed loads still fail the audit;
font status checks are not waived. Fuzz captures also compare renderer/font/camera
state before and after the screenshot and retry changed generations within a bounded
limit. Reports distinguish automated checks from pending visual review.
