# Portable Cartography Implementation Plan

> **For implementers:** Use `superpowers:executing-plans` to implement this plan task by task.

**Goal:** Improve readability and cartographic completeness using the same rules in
Grand Canyon and Sequoia, preserving responsive interaction and standalone delivery.

**Architecture:** Preserve source attributes in a common feature catalog, make area
and data selection configuration, and derive styling and label candidates from
feature semantics and ground scale. Share geographic decisions between the static
and interactive builders; retain separate compositions. Use cancellable, resumable
label preparation with stable accepted layouts during pans.

**Tech stack:** Existing Python/Shapely/NumPy pipeline, JavaScript layout engine,
SVG authoring/static output, Canvas interactive paint and optional WebGL contours;
Node, Python unittest and Playwright checks. Projection support uses the installed `pyproj` dependency.

**Status:** Implementation active, 2026-09-09. The user authorized execution and
local output promotion. Hosted publication is separate. Completion and source
coverage are established by the task record and release evidence below. The [comparison catalog](../CARTOGRAPHIC_COMPARISON.md)
is the rationale and owns S01–S25/C01–C32 identifiers used below.

The separate Canvas/WebGL implementation was committed and merged at `8336d94`.
It improves gesture drawing substantially, but does not meet the original 3× startup
responsiveness target. Its measured [performance](../PERFORMANCE.md) is the baseline
for this work, not an estimate of future gains.

## Execution rules and order

Read the [data contract](../specs/map-data.md), [layout contract](../specs/map-layout.md),
[pitfalls](../PITFALLS.md) and [validation guide](../VALIDATION.md) for each affected
interface. Proposed paths and commands below become available only as their task is
implemented. Do not import builders in tests: some read caches at import time.

For every behavior task: create the small failing regression, run it and establish
the intended failure, implement the minimum change, rerun focused checks, inspect
the affected real scene, then commit that task. Keep downloaded source archives and
large derived scenes out of Git. Pin small fixtures and source metadata for repeatability.
Update contract consumers deliberately when a task changes coordinates or schemas.

Sequence: tasks 1–3 deliver useful improvements against current data; tasks 4–6
establish portable data and route semantics; tasks 7–10 add content; tasks 11–12
verify portability and delivery. Do not wait for every external dataset before
fixing readability. Task 13 is the separately tracked startup target.

## Task 1: Make missing-label causes observable

**Addresses:** S03/S05/S07, C09; prerequisite for any claim about labeling completeness.

**Files:** modify `pipeline/labels/line-candidates.js`, `pipeline/labels/runtime.js`,
`pipeline/labels/place.js`; add `tests/browser/hydro-candidates.spec.js` and
`scripts/catalog-label-coverage.mjs`; extend `docs/specs/map-layout.md` diagnostics.

1. Extract a small named curved-waterway fixture that reproduces the current
   `no-valid-candidate` outcome. Include reversed direction, an off-path original
   offset, a straight usable subsection and disconnected runs. Keep names arbitrary.
2. Record stages separately: visible geometry, usable windows, upright windows,
   measured candidates, rejected measurements, solver rejection and budget state.
   Preserve the existing public `reason` field while adding detailed diagnostics.
3. Test that a visible, unobstructed named fixture has at least one valid candidate
   at 1× and 6×; failures must identify which stage eliminated it. Instrument before
   selecting the geometric fix—34 current failures are not proven identical.
4. Run `npm run test:browser -- tests/browser/hydro-candidates.spec.js --workers=1`;
   then run the catalog on the frozen current HTML to establish source/candidate/
   painted counts by class and view. Record hashes and browser versions.
5. Commit diagnostics and fixture independently of styling changes.

A minimal assertion shape, to implement against the fixture helper, is:

```js
expect(report.visibleNamedHydro).toBeGreaterThan(0);
expect(report.hydroWithCandidates).toBeGreaterThan(0);
expect(report.paintedNamedHydro).toBeGreaterThan(0);
expect(report.paintedNames).not.toContain('?');
```

Do not make this pass by suppressing coverage expectations or renaming failures.

## Task 2: Finish deferred preparation without blocking interaction

**Addresses:** S05/S07, C09 and the question about WebGL rendering headroom.

**Files:** modify `pipeline/labels/runtime.js`, `pipeline/labels/line-candidates.js`,
`pipeline/labels/policy.json`; add `pipeline/labels/preparation-queue.js`,
`tests/labels/preparation-queue.test.js`, `tests/browser/label-progress.spec.js`;
update `docs/PERFORMANCE.md` and the layout contract.

1. Add a deterministic fake-clock queue test with high/low-priority classes and
   expensive work. A short slice must leave a continuation; repeated idle slices
   must consider every eligible item without starving waterways/contours.
2. Key jobs by camera scale, viewport, fonts, layers and source revision. Cancel
   obsolete jobs on input; discard stale results. Prioritize visible geometry and
   provide class fairness, rather than processing the whole manifest blindly.
3. Separate **active work per slice** from elapsed time across yields. Start with
   bounded ≤8 ms cooperative slices, adjusting based on measured input/frame latency.
   Do not merely raise the existing elapsed 24 ms deadline to seconds.
4. Preserve accepted positions/wrapping throughout a held pan. At pan settlement,
   retain those positions and consider newly exposed content without displacing it.
   Zoom/font changes may invalidate layout. `whenSettled()` must reflect outstanding
   continuation work, not report completion while labels remain unconsidered.
5. Run `node --test tests/labels/preparation-queue.test.js` and
   `npm run test:browser -- tests/browser/label-progress.spec.js tests/browser/pan-layout.spec.js tests/browser/gesture-lifecycle.spec.js --workers=1`.
   Include cancellation during measurement, slow held drags, font changes and worker fallback.
6. Benchmark independently for Canvas/WebGL. Accept higher *total idle throughput*
   only if input latency stays bounded. Commit with before/after label coverage and latency.

GPU drawing headroom can permit more idle work; it does not change DOM/font costs or
justify doing more synchronous work inside each input handler.

## Task 3: Readable text and useful line-label candidates

**Addresses:** S01–S04/S07, C09/C10.

**Files:** modify `pipeline/labels/policy.json`, `runtime.js`, `line-candidates.js`,
`candidates.js`, both `pipeline/build_interactive.py` and `build_static.py` where
candidate production is shared; add `tests/browser/readability.spec.js`, extend
`tests/browser/hydro-candidates.spec.js` and `tests/labels/line-candidates.test.js`.

1. Test actual painted CSS sizes at overview/deep zoom, preserving the user font
   preference across reload; pure pans must preserve text, size and candidate identity.
2. Introduce semantic size tokens, modest growth on zoom up to a readable cap,
   and a persisted readability multiplier. Pure pans keep the same sizes. Trial
   place/trail 14–16 px, secondary 12–13 and contour 11–12. Give static print output
   a separate explicit size profile; do not apply screen pixels as print points.
3. Implement fixes justified by task 1. Support upright candidates in either line
   direction using independent label geometry; never reverse/move source geography.
   Prefer readable nearby windows; cap curvature and distance from the owning line.
4. Reject empty/placeholder names at annotation creation while preserving unnamed
   geometry. Remove substring-based hydro exclusions; temporary compatibility code
   may retain the old cache format, but new selection rules must be semantic.
5. Generate multiple stable world-anchored windows on connected feature components;
   choose screen-space repeat distance at placement. A single midpoint/longest run
   cannot satisfy arbitrary deep-zoom viewports. Avoid duplicate repetitions at joins.
6. Run focused browser/Node cases and independent geometry/typography checks in
   all three engines. Review enlarged labels against quieted terrain in both themes.
   Commit coverage/readability changes with explicit visual examples and limitations.

Do not use a per-creek allowlist or manually tune offsets to these seven views.
A larger font may reduce density; report the tradeoff instead of promising every name.

## Task 4: Introduce area configuration and provenance

**Addresses:** C01 and portability; prerequisite for tasks 5–10.

**Files:** create `pipeline/map_spec.py`, `pipeline/maps/grand_canyon.json`,
`pipeline/maps/sequoia.json`, `pipeline/sources/catalog.py`,
`tests/python/test_map_spec.py`, `tests/python/test_source_catalog.py`;
modify relevant fetchers/processors, `pipeline/build_maps.sh`,
`pipeline/requirements.txt`, and `docs/specs/map-data.md`.

1. Add tests for valid AOI, axis order, units, extent coverage and round-trip
   geographic→working→map transforms. Include the two parks at different latitudes.
2. Move frame, units and source selection into `MapSpec`; choose a suitable metric
   working CRS by an explicit rule/configuration. Keep current world-coordinate
   consumers working through an adapter until all are migrated together.
3. Version frame metadata in terrain/vector caches. Reject mismatched caches rather
   than silently warping water, trails, contours or cursor elevations differently.
   Keep existing geographic stops distinct from label offsets and route mileages.
4. Record provider, URL, dataset version, retrieval time, source IDs, AOI, hash and
   attribution. Cached builds remain network-free; refresh is an explicit operation.
5. Run `PYTHONPATH=pipeline .venv/bin/python -m unittest discover -s tests/python -p 'test_map_spec.py'`
   and the equivalent `test_source_catalog.py`, plus existing raster registration
   and water-area tests. Build Grand Canyon from unchanged inputs and investigate
   geographic differences before committing.

The initial Sequoia AOI should include a developed visitor area, forest, steep alpine
terrain and lakes. Its extent is test configuration, never a branch in style code.

## Task 5: Preserve complete vector features and topology

**Addresses:** C02/C04–C07; removes the current regional fetch/normalization shortcuts.

**Files:** create `pipeline/features.py`, `pipeline/sources/osm.py`,
`tests/python/test_features.py`, `tests/python/test_osm_source.py`;
modify `fetch_osm.py`, `fetch_osm2.py`, `osmdata.py`, both builders and the data contract.

1. Pin a tiny fixture with unnamed links, a complete route relation crossing the
   AOI edge, same-name disconnected paths and a surface/access change along one route.
2. Acquire relevant feature classes by AOI buffer, without named-route regexes or
   hand-coded sub-boxes. Retrieve required relation members/nodes; paginate/tile
   deterministically and detect incomplete responses.
3. Normalize stable provider identity, component topology and original tags. Retain
   route membership separately from physical segment identity. Do not join two
   unrelated features just because their names or endpoints are close.
4. Preserve importance, surface, smoothness, tracktype, SAC grade, trail visibility,
   access by mode, lifecycle/construction, ref/network and bridge/tunnel attributes.
   Missing/contradictory values remain explicit. Add compatibility adapters for old
   builder consumers while moving shared selection into `features.py`.
5. Run the two new unittest files plus existing `test_path_geometry.py` and
   `test_builder_inventory.py`. Compare acquired→normalized→selected inventories
   with reason counts in both regions; commit.

## Task 6: Attribute-driven roads/trails, names and route badges

**Addresses:** S11–S13/S18, C02–C07.

**Files:** create `pipeline/cartography/transport.py`,
`pipeline/cartography/styles.json`, `tests/python/test_transport_styles.py`;
modify both builders and manifest generation; add `tests/browser/transport-style.spec.js`.

1. Table-test arbitrary named/unnamed features: primary paved road, unpaved minor
   road, motor-restricted track, pedestrian path, steps, unknown difficulty, route
   membership, closed/construction feature and bridge crossing. Rename the fixture
   features and translate their geography: classification must not change.
2. Define independent visual dimensions: road importance/casing, surface/dash,
   access status, physical trail class and optional route highlight. Preserve
   agency management designations as metadata/overlays, not a false SAC mapping.
3. Add road labels, repeatable refs/shields and route badges from name/ref/network.
   Build the legend from active semantic styles; retain a selectable route emphasis
   comparable to the current red corridor highlight without hard-coded trail names.
4. Use ground scale to gate detail. Update both SVG and Canvas style consumers;
   WebGL still handles contours only. Test picking and layer order after extra roads.
5. Run new Python/browser tests plus stroke-width and paint audits; compare detail
   and CPU cost against the frozen Canvas baseline. Commit.

## Task 7: Hydrography, waterbodies and gazetteer enrichment

**Addresses:** S09/S10, C09–C16.

**Files:** create `pipeline/sources/usgs_hydro.py`, `pipeline/sources/gnis.py`,
`pipeline/cartography/hydro.py`, `pipeline/cartography/names.py`,
`tests/python/test_hydro_catalog.py`, `tests/python/test_name_matching.py`;
modify `fetch_water.py`, shared feature model and both builders.

1. Test river/stream/intermittent/unknown flow, a lake with an island, disconnected
   named components, two nearby different names and conflicting source geometry.
2. Use versioned USGS 3DHP/legacy extracts after checking actual AOI coverage.
   Prefer explicit GNIS IDs; record confidence for any other match. Never transfer
   names by unconstrained nearest-point matching or duplicate OSM/NHD-derived lines.
3. Extend water areas to lakes/ponds/reservoirs. Preserve river polygon precedence
   and existing ring/topology validation. Keep intermittency separate from potable
   water and current availability; unknown is not “perennial.”
4. Import natural-feature names/variants and public springs/falls/landmarks. Point
   labels are the first deliverable; only use ridge/valley axes or polygons where
   geometry supports them. Do not invent landform extents from a name point.
5. Run new unittest files and existing water-area tests, then task 1 coverage reports
   for both regions. Report unmatched names and duplicate/conflict counts; commit.

## Task 8: Facilities, trail graph distances and local detail

**Addresses:** S16/S17/S19, C08/C13/C14/C22–C27.

**Files:** create `pipeline/cartography/poi.py`, `pipeline/cartography/route_graph.py`,
`pipeline/cartography/symbols.py`, `pipeline/sources/agency.py`,
`tests/python/test_poi_catalog.py`, `tests/python/test_route_graph.py`;
modify both builders, manifest producer and directory generation.

1. Test facility duplicates across providers, nearby distinct facilities, bridges,
   trail junctions, disconnected networks and distance accumulation on known geometry.
2. Catalog public facility types and stable source IDs; use a reusable public icon
   set and grouped facility candidates. Keep geometry and visual offsets separate.
3. Generate junction-to-junction metric distances with units and source/method.
   Do not reuse river miles without a known stationing origin, or infer open potable
   water from an undated point. Conditions remain separate dated fields/links.
4. Add scale-gated buildings, streets, transport and service detail from providers.
   Implement reusable inset/detail rendering only after underlying data exists.
5. Run new tests, typography/association audits and dense developed-area scenes in
   both parks; verify search/picking and grouped symbols. Commit in small category batches.

## Task 9: Land cover and administrative/management context

**Addresses:** S06/S08/S14/S15/S23, C17–C21.

**Files:** create `pipeline/sources/landcover.py`, `pipeline/sources/boundaries.py`,
`pipeline/cartography/areas.py`, `tests/python/test_area_layers.py`;
modify terrain compositing, both builders, scene extraction and layer controls.

1. Test overlapping park/wilderness/ownership polygons, islands, labels inside
   polygons and categorical raster resampling. Do not merge different designation
   types into a single ownership claim.
2. Add generalized Annual NLCD land cover, with agency vegetation as an optional
   provider. Use neutral relief as a portable default; remove universal dependence
   on Grand Canyon elevation/geology color bands.
3. Add PAD-US/agency boundaries with explicit semantic types. Discover public
   management units and metadata by provider; support area codes/tables generically.
   If only dated PDFs exist, record the gap and effort instead of claiming fresh GIS.
4. Test source date/identity retention and source conflicts; build both parks and
   verify masks align with terrain and hydro. Review light/dark hierarchy and density.
5. Run `test_area_layers.py`, raster registration tests and layer-toggle/paint audits;
   commit. Management regulations require a separate source-currency review.

## Task 10: Map furniture and sheet context

**Addresses:** S20–S22/S24, C28–C32.

**Files:** create `pipeline/cartography/furniture.py`,
`tests/python/test_map_furniture.py`; modify both builders, layout manifest and
interactive scale control; add `tests/browser/live-scale.spec.js`.

1. Test scalebar length against a known metric frame at multiple latitudes/zooms,
   grid edge labels at clipping boundaries, and inset projection/locator consistency.
2. Add live metric/imperial scale, optional coordinate grid and generated insets.
   Respect control exclusions and leave enough space for labels at narrow widths.
3. Optional static declination uses a dated WMM calculation. Generate management
   legends/info panels from selected data. Airspace is an optional separate provider,
   not a default transport style or a prerequisite for the useful first release.
4. Run new tests plus static finalization and interactive control tests; commit.

## Task 11: Prove portability and preserve performance

**Files:** create `tests/fixtures/cartography/` with small source fixtures,
`scripts/audit-cartography.mjs`, `docs/cartography/coverage-baselines.json`;
modify relevant fixture builders and `docs/ADAPTING.md`, `docs/DESIGN.md`,
`docs/DATA_SOURCES.md` to describe the actual installed implementation.

1. Freeze a source inventory and reviewed expected-feature subset for each region.
   Match equivalent ground scales, not equal raw zoom ratios. Include developed
   streets/services, route junctions, intermittent tributaries, large water, steep
   slopes, forest/meadow edges, a lake, and administrative boundaries where available.
2. Test name-renaming and geographic translation fixtures to catch ad hoc logic.
   Grand Canyon/Sequoia may differ in configuration/data, not classifier branches.
3. Audit source→catalog→scene→candidate→paint counts. Every missing expected feature
   needs a reason; blanket optional suppression is not successful coverage. Keep
   required expectations separate from solver collision boxes.
4. Run all Python/Node tests and affected browser tests. Independently inspect
   geometry, typography, pan stability, zoom transitions, both themes, DPR 1/2,
   narrow/wide viewports and Canvas/WebGL/SVG fallback.
5. Add seeded fuzzing-style visual interaction testing in
   `scripts/fuzz-cartography.mjs`. Exercise both regions, Canvas/WebGL and SVG
   fallback, light/dark themes, narrow/wide viewports and DPR 1/2. Generate
   random pans, zooms, rapid reversals, held/interrupted drags, wheel bursts,
   layer changes, font-size changes, resizes and reset/return sequences. Check
   page/console errors, unhandled rejections, finite camera state, eventual
   completion, correct painted camera, missing/stale layers and label stability
   on pure pans. Capture periodic screenshots and failure frames; review contact
   sheets for clipping, blank frames, duplicate/stale text and other visual
   glitches that geometry checks cannot establish. Record seeds, actions,
   browser/version, artifact hashes and replay commands. Minimize any failing
   sequence into a regression before accepting the release. This is additional
   evidence, not a substitute for the existing deterministic release scenes.
   Harness v2 adds a recorded interruption burst: change theme, font size, layer
   and viewport while a native map pointer is held, then verify eventual recovery.
   A separate scroll-away/back action invalidates preparation before changing its
   screen frame. Pure-pan checks compare application, text HTML and camera-normalized
   footprints for shared visible labels (0.05 CSS px tolerance); clipped labels may
   disappear. Record shared counts and actual scroll movement so unexercised cases
   remain explicit. These additions need fresh exact-candidate matrix evidence.
6. Run sequential renderer/startup benchmarks using immutable before/after files,
   same hardware/browser/viewport, at least three repetitions. Preserve raw results.
   Aim for no >10% regression in median/p95 gesture CPU or early-input latency;
   investigate variance before treating that proposed tolerance as a release contract.
   Report total idle label-completion time separately from responsiveness.
7. Document remaining unavailable/stale sources. A successful fixture is not proof
   that Sequoia's current trails or facilities are complete. Commit validation evidence.

## Task 12: Release validation and integration

Use the commands and artifact mappings in [layout operations](../LAYOUT_VALIDATION.md).
Build candidates with `npm run build:maps`, then run `npm run verify:maps` against
reviewed coverage profiles. Resolve the known Firefox/light static-finalizer overlap
before claiming a full release pass. A focused renderer pass does not waive it.

Review the final source diff, attribution, map-use notice, data hashes and both
candidate outputs. Integrate source changes after checking main for parallel changes.
Use `npm run promote:maps` only within authorized delivery scope after the full gate
passes; never manually copy candidates into `output/`. Hosted publication remains
separate. Preserve worktrees until their evidence and needed artifacts are retained.

## Task 13: Remaining 3× initial-responsiveness target

**Status:** Separate unresolved performance objective, not delivered by the backend swap.

**Files to investigate:** `pipeline/build_interactive.py`, `pipeline/render/scene.js`,
`pipeline/labels/runtime.js`, `initial-placement-client.js`, `contour-preview.js`,
`scripts/benchmark-startup.mjs`, `scripts/benchmark-renderers.mjs`.

1. Freeze the new baseline and define the primary metric as queued early input to
   the first correct camera frame; separately report navigation-to-interactive and
   fully labeled time. Use trusted input where feasible and label rAF proxies honestly.
2. Trace HTML/SVG parse, font/image decode, path preparation, initial geometry
   measurement and first placement. Identify the critical path before choosing a rewrite.
3. Prototype precomputed scene metadata, deferred dense contours and measurement-only
   SVG creation on demand; retain standalone loading and deterministic source identity.
   Do not add more deferred work merely to make a readiness flag fire sooner.
4. Compare against the measured baseline, including startup input during each phase.
   Adopt only changes with real latency gains and correct progressive rendering.
   The minimum desired ratio is ≥3× for the agreed initial-response metric; it remains
   a target, not a predicted outcome. Revise this task's implementation details after tracing.

## Completion criteria for the useful first release

- Larger, measured text; known named hydro fixtures actually labeled; no placeholder
  names; deferred classes eventually considered when idle.
- Pan preserves accepted text layouts; new input cancels stale preparation.
- Road/trail distinctions derive from attributes, with explicit unknowns and route
  membership separate from physical/management classes.
- Both regions build from configuration using the same feature/style code. Sequoia
  validates lakes/vegetation/facilities that canyon-only testing would miss.
- Source provenance and omission reasons are inspectable; no fabricated geographic
  corrections or claims of current conditions from old reference data.
- Performance, visual/geometry checks and release status are reported separately.
  Neither prettier screenshots nor faster GPU drawing substitutes for those checks.

## Execution record

- [x] 1. Label diagnostics and regression
- [x] 2. Resumable preparation
- [x] 3. Readability and line candidates
- [x] 4. Area configuration/provenance
- [x] 5. Feature topology/attributes
- [x] 6. Transport styling
- [x] 7. Hydrography/gazetteer
- [x] 8. Facilities and route distances — glyph/elevation/segment-label review
- [x] 9. Land cover/boundaries
- [x] 10. Furniture
- [ ] 11. Portability/performance validation
  - [x] Seeded visual fuzzing, replayable failures, screenshot/contact-sheet review
- [ ] 12. Release and promotion
- [ ] 13. Separate production 3× startup target
  - [x] Corrected probes, trace investigation and diagnostic ablations

User steering: the camera is already smooth. Preserve it; focus implementation on
font growth/readability, label completion and cartographic content. Idle label latency
is acceptable provided ongoing interaction remains responsive. Task 13 stays separate.

First batch: reversed/winding hydro regressions and transition back to textPath
passed with the existing line-adapter suite (45 browser cases). Idle preparation
reuses the existing cancellable async loop instead of introducing a second queue;
startup deadline remains bounded while idle slices complete all eligible items.
Progress/pan/gesture/settled tests passed (66 cases before typography changes).
Zoom growth and text preference passed in all engines (9 focused cases); Canvas
sprite invalidation has its own regression. Source-only changes are not promoted.

Source foundation: `ad390fb` adds MapSpec, complete OSM attribute/topology caches,
GNIS, 3DHP, PAD-US, Annual NLCD and 3DEP adapters. Independent review found and
resolved NLCD native-grid alignment and explicit multi-ring repair reporting.
Both-region raw/derived hashes and frames were checked. Subsequent renderer
review produced additional regressions for OSM islands, facility-node
classification, crossing hydrography and source-identity matching; geographic
integration is still under validation.

Release tooling: `a5be603` corrects native Canvas/SVG trail-picking checks and
reserves measured cross-engine font expansion during static freezing, while
keeping all six serialized audits. Timing schema v2 reports total idle label
completion separately from camera timing limits. Four unit and ten focused
browser cases passed. Startup probes/report are tracked in `3afecad`; the 3×
target remains unproven. No outputs have been promoted by these commits.


Visual testing execution: the seeded harness is installed and initial runs exposed
empty clipped water paths, unnamed-facility label clutter, area-outline scaling,
missing centered lake candidates and a textPath commit offset reset. Focused
regressions accompany these fixes. Independent paint audits remain mandatory;
passing camera-state fuzz checks alone does not establish label correctness.
See [implementation record](../CARTOGRAPHY_IMPLEMENTATION.md) for evidence/status.

Tasks 3–10 have shared semantics, source provenance, regression cases and
both-region builds. Final source review completed facility glyphs, source-backed
peak elevations and on-map segment distances. Twenty-one matched-scale source/paint
scenes have been inspected. Final fuzz and release validation remain Tasks 11–12;
their pending status is not a claim that implementation is absent.
POI priorities now derive from navigation categories; ordinary services and scenic
features remain available as secondary detail. Static visual review also found
interaction hit paths painting black; the static scene now omits that interaction
geometry. Point preparation reserves 0.125px for backend glyph rounding without
relaxing the painted displacement limit.


Final seeded validation: six 18-action sequences and all 114 successful frames
passed automated checks and visual review on the final candidate hashes. The
Grand Canyon WebKit sequence was rerun after correcting audit font readiness;
its original failed report is retained. Five narrow-view point-name omissions
were independently explained by 901 candidates blocked by current controls/frame
bounds. No pending layout work or unresolved visual defect remained in the reviewed
frames. The combined selection, exact hashes and screenshot review are recorded
in `artifacts/cartography/fuzz-release-combined.json` and the linked evidence.
Full release promotion and quiet before/after performance measurement remain pending.
