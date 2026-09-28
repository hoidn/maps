# Regional Generation and Large-Format Printing Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this
> plan task by task, or `superpowers:subagent-driven-development` when delegated
> execution is selected. Steps use checkboxes for tracking.

**Goal:** Generate San Gabriel Mountains as the third regional map and automated
portability test, and export large-format PDFs with a complete printed map collar.

**Architecture:** Extend the existing `MapSpec` → source caches → shared SVG scene
→ label layout path. Preserve the authored Grand Canyon builders. One shared
print-sheet composer feeds the existing static finalizer and one Playwright PDF
export command; geographic frames stay independent of physical page dimensions.

**Tech stack:** Python, NumPy, pyproj, existing cartography modules; Node 24,
Playwright, native SVG/CSS; Poppler/MuPDF for independent PDF inspection. Reuse
the checked-in Python unittest, Node test and Playwright harnesses.

**Status:** Authorized execution active. Region integration, physical print export and
bounds-driven generation are implemented. Fixture validation passes; real San Gabriel
inputs are acquired; both real PDFs pass mechanical checks and have visual reviews.
Interactive matrix acceptance remains in progress. Nothing has been promoted or published.

**User clarification:** New maps start from a selected area/bounding box. A checked-in
San Gabriel preset alone does not establish automated region setup. The generic command
derives its specification and dimensions; the real third-map proof must use this path.

**Current evidence (2026-09-22):** The final full suites pass
[197 Python tests](../../artifacts/regional-print/final-python-tests.log) and
[197 Node tests](../../artifacts/regional-print/final-node-tests.log). The print/PDF
fixture run passes 14 checks (10 intentional duplicate skips), including 36 × 24
and 96 × 60 inch sheets, unregistered bounds, the authored adapter, legends,
calibration and rollback. Focused three-engine regressions cover measurement,
selection, runtime input targets, inert JSON, actual painted-source evidence and
resource cleanup. Fixture passes do not establish real-map interaction acceptance.

All six San Gabriel providers (OSM, 3DEP, 3DHP, GNIS, NLCD and PAD-US) are acquired
and hash-verified. The 55-section OSM merge contains 13,336,395 complete objects
at its recorded June 1 snapshot. Normalization produced 1,054,031 features and
reported 64 rejected geometries, including 52 whose bounds intersect the frame.
[Source checks](../../artifacts/regional-print/san-gabriel/source-checks.json) and
[reviewed source identities](../../artifacts/regional-print/san-gabriel/reviewed-source-identities.json)
retain the evidence; retrieval dates do not establish source currency. Real Grand
Canyon/Sequoia caches are absent, so their real print acceptance remains pending.
The normalized relief samples are approximately 36.46 × 43.94 m; native source
resolution is unreported, rather than inferred from that export grid.

The public selected-bounds workflow derived the San Gabriel specification,
acquired its sources and built the regional outputs. Its cached continuation
exited 0, including six audits of native frozen HTML SHA
`66b5de5267db2aa379db509facece0344c2d1ce7d71dc8889c764ad4d9c2c8fa`
and the 36-inch PDF. The current public interactive HTML is 715,498,208 bytes,
SHA `5da66938564313e3b7711aefb65d8418c111880c127f50c09c005685fa862eb3`.

Both real PDFs pass six independent Chromium/Firefox/WebKit light/dark audits
with zero findings, plus single-page size, embedded-font, map-interior vector,
terrain-pixel and calibration checks. The 100 mm bar measures 100.189 mm after
rasterization. Whole-poster and 300 DPI crop reviews find readable collars,
vector text and dense trails, with the label and raster limits below. These are
digital reviews, not physical printer proofs or evidence of current trail access.

| Accepted PDF | Mechanical evidence | Visual evidence |
|---|---|---|
| [36 × 24 inches](../../artifacts/print/san-gabriel-current.pdf) | [Print report](../../artifacts/print/san-gabriel-current.print.json) | [Whole poster and six crops](../../artifacts/regional-print/san-gabriel/pdf-36-current-visual/review.json) |
| [Nominal 1:50,000](../../artifacts/print/san-gabriel-50k.pdf) | [Print report](../../artifacts/print/san-gabriel-50k.print.json) | [Whole poster and thirteen crops](../../artifacts/regional-print/san-gabriel/pdf-50k-visual/review.json) |

The 36-inch PDF SHA is
`1e187b4432676813a5959cf58ecfef94946cb057eb9d4d5f4ee71891da5b8b40`,
from frozen SHA `f0583c6f7b29f1a13045ad8ce0207f65e2e773d905ea9a077f59b748875af59a`.
It retains 156,876 map-interior vector paths. Relief is approximately 74 × 61 DPI
and land cover 37 DPI. San Antonio's summit name is visible; Wilson's summit
symbol/name and Baden-Powell's name lose existing placement checks. The bold
Mount Wilson name belongs to the separate settlement. Only two of 122 contour
labels are visible (3,000 and 4,000 feet); exact-path diagnostics attribute most
omissions to existing curvature/uprightness rules, not incorrect physical font size.

The 1:50,000 PDF SHA is
`65e8197156c4ba0288fd2a997b6c9c1a8cb9773bd9658b655ff7bed965fb8432`,
from frozen SHA `c959aa4621339e69d8374f4a5327c51ae1c62a4440c3f7635b57d1f677b81456`.
Its 5,436 × 3,136.08 point page retains 159,140 map-interior paths and 16,248 text
operations. Relief is approximately 35 × 29 DPI and land cover 17 DPI; cells
remain visibly coarse. Antonio and Baden-Powell summit names/elevations/symbols
are visible. Wilson's summit symbol is visible but its summit name is omitted;
the bold name remains the distinct settlement. There are 42 visible contour
labels out of 122. Neither sheet establishes comprehensive summit/contour naming.

The accepted 1:50,000 layout uses the `befc274` runtime derivative, with all bytes
outside the runtime unchanged from its original staging file. Its
[provenance and mechanical summary](../../artifacts/regional-print/san-gabriel/50k-native-crash/point-envelope-50k/mechanical-summary.json)
record normal-heap settlement with 3,676 placements and no missing required content.
The [five former WebKit failures](../../artifacts/regional-print/san-gabriel/50k-native-crash/point-envelope-50k/five-point-outcomes.json)
are now omitted optional labels under recorded collision/frame outcomes; source
identities and anchors remain intact. The later `b6a3bfc` fix probes the immutable
original name after initial wrapping and has three focused differential passes.
It is absent from the accepted run: the exact-byte audits validate that layout,
while the newer source change has separate focused evidence. No heap override,
geometry threshold or independent audit gate was relaxed.

The complete [12-scene coverage audit](../../artifacts/regional-print/san-gabriel/coverage.json)
is bound to interactive SHA
`1408f4196d083a38d6d15bc52f1f0843f1f8ddfd65c5a9e2ba9a46c9c73efc95`:
nine scenes pass and three Mount Wilson summit-marker expectations fail at
32/12/6 m/pixel through ordinary collision selection. The summit name is placed
at 6 m/pixel; a settlement is never counted as the summit. Full scene outcomes
and the [visual review](../../artifacts/regional-print/san-gabriel/coverage-visual-review.json)
remain available. Those scales respect the existing 14× zoom cap; requested
scales that would be clamped are rejected. The
[1408-to-5da byte comparison](../../artifacts/regional-print/san-gabriel/provenance-1408-to-5da/summary.json)
proves identical geometry, metadata, source identities, images and styles; only
the two executable scripts changed for input/selection fixes. Source-content
review applies to those identical data/styles without a fresh 12-scene rerun
solely for that purpose. Mechanical coverage, its three failures and interactive
acceptance do not transfer to the new hash.

A September 28 [source and solver review](../../artifacts/regional-print/resume-20260928/wilson-review.json)
found that Wilson's omissions follow the current optional priorities, rather than
an established solver defect. The nearby water source is distinct from the summit;
their fixed symbols cannot meet the current clearance even at maximum zoom.
The fixture requires the summit marker at all three scales, while the accepted
design does not prescribe that precedence. The user has been asked which generic
editorial priority to use; the existing coverage failures remain unresolved.

The nine-case matrix on `5da66938…` completed with nine failures. The
[completed-case records](../../artifacts/regional-print/san-gabriel/fuzz-public-5da66938/completed-cases.jsonl)
and [aggregate report](../../artifacts/regional-print/san-gabriel/fuzz-public-5da66938/matrix.json)
preserve the exact actions, candidate hash and backend coverage. Chromium SVG
exceeded the 120-second watchdog on layer action 6; Canvas on interrupt action 11;
WebGL on URL restoration action 14 after successful real place selection.
Firefox SVG timed out taking the selection capture at action 13; Canvas and the
requested WebGL case timed out taking the interrupt capture at action 11. Firefox
WebGL used Canvas fallback, so it does not establish WebGL coverage. All three
WebKit cases exceeded the navigation limit before reaching any action. Completed
paint captures have zero audit findings, but no case completed the interaction
sequence; these results do not establish interactive acceptance. The
[remaining frame review](../../artifacts/regional-print/san-gabriel/fuzz-public-5da66938/remaining-visual-review.json)
covers 49 Chromium WebGL/Firefox frames: map paint remains nonempty, the old
mobile overlap remains visible, and the flagged Sandrocks name/symbol are absent
near the frame edge. WebKit has no frames to review.

The [Canvas visual review](../../artifacts/regional-print/san-gabriel/fuzz-public-5da66938/san_gabriel-chromium-canvas/visual-review.json)
found a 430 px control defect: the scale box partly hid Layers. Commit `e4a7105`
places persistent mobile controls and readouts below the unchanged geographic
frame. A fresh September 28 [browser run](../../artifacts/regional-print/resume-20260928/responsive-results.json)
passes 21 checks across the three engines, covering regional/authored aspect
ratios, SVG/Canvas/WebGL requests, actual backend or fallback, camera/anchor
preservation, static wrappers and usable Layers controls. The existing open-menu
popup intentionally overlays noninteractive readouts. The September 28
[candidate rebuild](../../artifacts/regional-print/resume-20260928/candidate.json)
completed with exit 0 in 12m08s ([build log](../../artifacts/regional-print/resume-20260928/build.log)),
producing `artifacts/regional-print/resume-20260928/san_gabriel_trails_interactive.html`
at 715,499,365 bytes, SHA
`0e365051607951f704a39f9bbcd41524028c45fa43d75419f7c267fcc78fbb98`.
The old matrix did not include the CSS fix. A fresh
[Chromium WebGL request](../../artifacts/regional-print/resume-20260928/current-chromium-webgl/report.json)
on the rebuilt candidate passed navigation in 45.49s and readiness in 87.57s,
then exceeded the unchanged 120-second initial-checks watchdog, with zero actions
and captures. The harness closed the browser during cleanup without an external
kill; this result does not isolate the timeout cause or establish acceptance.
The shared agent guidance is preserved in `6b015cd`.

Execution resumed September 28 with isolated load/interaction diagnosis before
another real matrix run. Navigation, application settlement, independent audits
and screenshots must be measured separately; timeout causes remain unresolved.

The [first-case record](../../artifacts/regional-print/san-gabriel/fuzz-public-5da66938/first-case-result.json),
[comparison](../../artifacts/regional-print/san-gabriel/fuzz-public-5da66938/first-case-comparison.json)
and [six-frame review](../../artifacts/regional-print/san-gabriel/fuzz-public-5da66938/first-case-visual-review.json)
also preserve a separate ENOSPC failure during input copying: primary failure
status/state were not saved in the original report. The partial copy is archived
and the complete input recovered from a verified immutable copy. `cf1519d` fixes
failure ordering, separate copy-error reporting and browser/server cleanup; three
actual CLI regressions and seven initialization/pan checks pass. Later matrix
children used that fix, without changed actions or gates. Initialization phases
and actions retain 120-second limits; settlement retains 90 seconds. The separate
8 ms/33 ms warm-camera and 3× startup targets remain unproven. Focused selection
and reload-based URL tests do not substitute for the unfinished real matrix.

Completed evidence is retained in ignored workspace paths, not solely on a
temporary volume. The stable logical 1:50,000 folder is documented by its
[retention manifest](../../artifacts/regional-print/san-gabriel/50k-native-crash/point-envelope-50k-retention.json)
and [audit archive manifest](../../artifacts/regional-print/san-gabriel/50k-native-crash/point-envelope-50k-retention-archives.json).
Earlier inventories, failed candidates and inputs remain indexed by
[print audit archives](../../artifacts/regional-print/archived-inactive-print-audits.json),
[disk-recovery archives](../../artifacts/regional-print/archived-inactive-print-audits-disk-recovery.json)
and [other inactive evidence](../../artifacts/regional-print/archived-inactive-evidence-separate-volume.json).
These record original paths, hashes and restoration instructions; old temporary
paths describe recovery history. Detailed retry investigations remain in these
artifacts and Git history. No delivered `output/` file has been promoted or published.

**Design:** [Regional generation and print design](2026-09-22-regional-generation-and-print-design.md),
including the user's clarified requirement for a conventional printed map collar.

## Boundaries and dependencies

Follow [AGENTS.md](../../AGENTS.md), the [data contract](../specs/map-data.md),
[layout contract](../specs/map-layout.md), [validation guide](../VALIDATION.md)
and [layout operations](../LAYOUT_VALIDATION.md). Consult the DEM, coordinate and
label-anchor sections of [Pitfalls](../PITFALLS.md) before changing those paths.

There are two independently testable increments: regional generation (tasks 1–4)
and printing (tasks 5–8). Their real-artifact acceptance joins in tasks 9–11.
Task 9 can start after task 4, so source-service availability is discovered early.
Keep each numbered task a reviewable commit; record failed prerequisites and
continue independent work without labelling the blocked increment complete.

No new renderer, provider framework, copied regional builder, projection migration,
home-printer tiling or lidar processing. Magnetic declination remains absent unless
a verified dated calculation is supplied. Hosted publication is separate. This
plan produces regional candidates and printable artifacts; adding a general
regional promotion system is not necessary to prove those results.

### Ownership and planned files

| Owner | Files | Responsibility |
|---|---|---|
| Region selection | `pipeline/map_spec.py`, `pipeline/maps/san_gabriel.json`, `pipeline/build_maps.sh` | Validated map IDs/configuration and cached build selection |
| Scene integration | `pipeline/cartography/integration.py`, `pipeline/build_region.py`, `pipeline/build_static.py`, `pipeline/build_interactive.py` | Pass the actual specification; retain the authored adapter; separate static and interactive output |
| Print sheet (new) | `pipeline/cartography/print_sheet.py`, `pipeline/cartography/print.css` | Physical layout calculations, print profile, collar and print HTML composition |
| Existing style owners | `pipeline/cartography/furniture.py`, `pipeline/cartography/scene.py`, `pipeline/cartography/integration.py` | Reuse geographic furniture, symbol/style definitions and legend entries |
| Placement/freezing | `pipeline/label_manifest.py`, `pipeline/labels/schema.js`, `pipeline/labels/runtime.js`, `scripts/finalize-static.mjs` | Optional static print profile, physical-size measurement and frozen metadata |
| PDF export (new) | `scripts/print-map.mjs`, `package.json` | One public print command, subprocesses, finalization, PDF validation and atomic replacement |
| Coverage | `scripts/audit-cartography.mjs`, `scripts/fuzz-cartography-matrix.mjs`, `tests/fixtures/cartography-scenes.json` | Third-region coverage, explicit region selection and rejection of empty audits |

New test files are named in their owning tasks. Add no general print-job registry,
plugin system or alternative geometry format. Use normal functions and existing
manifest metadata. Inspect every caller before changing shared signatures.

### User-facing commands to implement

These interfaces are implemented. The first command is the bounds-driven public path:

```bash
npm run generate:map -- --title 'San Gabriel Mountains' --bbox=-118.45,34.10,-117.42,34.55 --id san_gabriel --paper 36x24in --output artifacts/print/san-gabriel.pdf

# Separate acquisition/build/export operations for an existing preset.
(cd pipeline && ../.venv/bin/python fetch_region.py --map san_gabriel --source all)
npm run build:maps -- --map san_gabriel
npm run print:map -- --map san_gabriel --paper 36x24in --output artifacts/print/san-gabriel.pdf
npm run print:map -- --map san_gabriel --scale 50000 --output artifacts/print/san-gabriel-50k.pdf
```

`build:maps` without arguments keeps the Grand Canyon pair/Canvas companion and
discovers other configured regions with complete essential caches. Explicit
`--map ID` requires only that map's inputs and errors when they are missing.
`print:map` defaults to 36 × 24 inches only when neither paper nor scale is given.
Scale alone derives paper size; paper plus scale must fit without implicit
shrinking. Generated PDF/report paths default under ignored `artifacts/print/`.

## Task 1: Establish a reproducible baseline

**Files:** Read `package.json`, `.node-version`, `pipeline/requirements.txt`,
`tests/support/build-fixture.py`, `tests/support/browser-fixture.js`.

- [x] Inspect `git status --short`; preserve unrelated work and the design/plan.
  If execution requires isolation, follow `superpowers:using-git-worktrees`.
- [x] Select Node `24.6.0` from `.node-version`, then run the setup below. Check
  `pdfinfo`, `pdffonts`, `pdftoppm` and `mutool` availability; document missing
  system tools rather than replacing them with a hand-written PDF parser.

  ```bash
  node --version
  npm ci
  npm run browsers:install
  python3 -m venv .venv
  .venv/bin/pip install -r pipeline/requirements.txt
  npm run build:labels
  .venv/bin/python -m unittest discover -s tests/python -p 'test_map_spec.py'
  node --test tests/labels/cached-build.test.js
  ```

- [x] Record the focused baseline result and available caches under
  `artifacts/regional-print/`. Missing live caches are expected prerequisites,
  not permission to replace real geography with a test fixture.

**Done when:** The selected interpreters and baseline results are recorded.
Dependency/network failures are distinguished from assertion failures.

## Task 2: Add the third specification and preserve it through integration

**Files:** Create `pipeline/maps/san_gabriel.json`; modify `pipeline/map_spec.py`,
`pipeline/cartography/integration.py`, all three builders; extend
`tests/python/test_map_spec.py`, `tests/python/test_portable_cache_validation.py`.

- [x] Extend projection/metric/cache-registration tests to discover all checked-in
  `pipeline/maps/*.json` files. Add a custom-spec regression: use a different
  frame/title with the same ID and verify integration retains the supplied object
  and validates against its frame rather than silently reloading the named file.
- [x] Run the two targeted Python test files; confirm the new regression fails
  because `build_region.build()` passes `spec.id` and `improve()` reloads it.
- [x] Make `improve(svg, manifest, dem, spec)` consume a `MapSpec` directly.
  Pass `o.SPEC` from both authored builders and `spec` from the regional builder;
  update direct test callers. Remove the displaced implicit ID reload/default.
- [x] Add San Gabriel's proposed frame `[-118.45, 34.10, -117.42, 34.55]`, title,
  subtitle, current source set and `[250,100,50]` contour profile. With width 1300,
  derive and store integer height from the central WGS84 geodesic aspect ratio.
  Geographic anchors must come from sources. Required editorial names/routes
  remain empty until actual source review in task 9 establishes stable identities.
- [x] Reject unsafe map IDs used as cache/output path components (including path
  separators and traversal), while retaining explicit JSON-file loading. Reuse
  one configuration discovery path; do not add a second region registry.
- [x] Rerun the two test files and `test_builder_inventory.py`; confirm the authored
  builders' feature inventory and standalone fonts remain intact. Commit the task.

  ```bash
  for suite in test_map_spec.py test_portable_cache_validation.py test_builder_inventory.py; do
    .venv/bin/python -m unittest discover -s tests/python -p "$suite" || exit 1
  done
  ```

**Done when:** Three configurations share one geographic integration path and
custom specs cannot be reinterpreted as another cached frame.

## Task 3: Make regional static generation a usable print input

**Files:** Modify `pipeline/build_region.py`, `tests/support/build-fixture.py`,
`tests/support/managed-map-adapter.js`, `scripts/finalize-static.mjs`,
`tests/browser/managed-audit.spec.js`, `docs/specs/map-layout.md`;
create `tests/python/test_region_builder.py` and
`tests/browser/regional-generation.spec.js`.

- [x] Add a small portable fixture to the existing fixture producer: registered
  float32 DEM/metadata/hash, framed OSM catalog, minimal trail/road/water/summit
  geometry and source records explicitly marked synthetic. Write only into a
  temporary directory. Include a custom configuration file outside `pipeline/maps/`.
- [x] Build static and interactive regional HTML in subprocesses from that fixture.
  Assert complete manifests, unchanged source anchors, embedded resources and no
  network requests. Static must lack `.ctl`, cursor payload, pan/zoom event script
  and trail hit paths; interactive must retain them. Confirm failure before edits.
- [x] In `build_region.py`, require essential caches before generation. Keep its
  layout runtime in static staging, but emit interaction code, cursor data and
  control markup only for interactive mode. Force native SVG for static paint;
  static contours must remain inline rather than packed for workers.
- [x] Make the regional page title and legend instructions reflect its mode.
  Preserve source attribution and the map-use notice in both modes.
- [x] Before finalizing a regional fixture, fix the independent audit's required
  route selection. `checkManagedInventory()` currently uses global
  `policy.requiredRoutes`, which contains the three Grand Canyon corridor trails;
  the runtime already uses `manifest.map.requiredRoutes` when present. Resolve
  declared regional requirements consistently for solving and auditing, retaining
  the policy fallback only for older manifests without that field. An explicit
  empty array must remain empty. Record the effective requirements in audit
  evidence and document their ownership; do not globally clear the policy.
- [x] Add failing managed-audit regressions for an empty regional route list,
  a missing required route in a nonempty regional list, and Grand Canyon's three
  required routes remaining enforced. Test the finalizer with its normal default
  policy, not a test-only `requiredRoutes: []` override that hides this defect.
- [x] Add a browser check that opens the generated HTML with network access blocked,
  waits for settled layout and exercises interactive controls. Reopen finalized
  static fixture bytes without JavaScript to verify visible map content.
- [x] Run `test_region_builder.py`, `test_portable_cache_validation.py`, then
  `npm run test:browser -- tests/browser/regional-generation.spec.js tests/browser/managed-audit.spec.js`;
  commit.

  ```bash
  for suite in test_region_builder.py test_portable_cache_validation.py; do
    .venv/bin/python -m unittest discover -s tests/python -p "$suite" || exit 1
  done
  ```

**Done when:** The real regional producer, not a substitute test template, emits
both working interactive HTML and audited static output offline, using its own
declared requirements while retaining Grand Canyon's required-content checks.

## Task 4: Select regions through the existing cached build entry point

**Files:** Modify `pipeline/build_maps.sh`, `tests/labels/cached-build.test.js`,
`.gitignore`; reuse configuration discovery from task 2.

- [x] Add a subprocess regression selecting `san_gabriel` in a temporary checkout
  with no Grand Canyon inputs. Verify missing-input errors name only regional
  essentials: `features.json`, `dem.npy`, `dem.json`. Test unknown IDs, missing
  arguments, unsupported flags and no-argument legacy behavior. Run to failure.
- [x] Parse `--map ID` before preflight. Branch at the existing orchestration point:
  authored Grand Canyon sequence or shared regional sequence. Keep label bundling
  once per invocation and preserve the existing no-fetch rule and `MAP_PYTHON`.
- [x] Replace the hard-coded optional Sequoia block with configuration discovery.
  Announce skipped uncached regions in default mode; fail for an explicitly selected
  incomplete region. Build regional interactive, static staging and frozen static
  candidates with documented names, including `san_gabriel_trails_static_final.html`.
- [x] Use the existing finalizer for each selected static candidate. Scope ignore
  rules to regional generated HTML under `pipeline/`; do not ignore source fixtures
  or tracked `output/` deliverables.
- [x] Rerun `node --test tests/labels/cached-build.test.js` and the fixture build
  checks. Run `bash -n pipeline/build_maps.sh`; commit.

**Done when:** A third region builds from its own caches using the normal root
command, and existing Grand Canyon behavior is retained.

## Task 4a: Generate a region from selected bounds (user clarification)

- [x] Derive a validated specification, geodesic aspect ratio, safe cache ID and source
  defaults from title/bounds; no checked-in region entry is required.
- [x] Add `npm run generate:map` to run acquisition, cached builds, static finalization
  and PDF export. `--cached` reuses inputs without fetching. Persist generated specs in
  the ignored region cache and accept explicit spec paths in build/print commands.
- [x] Exercise an unregistered area end to end with explicitly synthetic provider caches;
  validate its interactive HTML, frozen static HTML, frozen print HTML and PDF.
- [x] Run actual San Gabriel through this command with its original approved bounds and
  retained source caches. Update the workflow documentation and artifact evidence.

## Task 5: Define physical print geometry and its static profile

**Files:** Create `pipeline/cartography/print_sheet.py`,
`tests/python/test_print_sheet.py`; modify `pipeline/label_manifest.py` and
`pipeline/labels/schema.js`; extend `tests/labels/schema.test.js`.

- [x] Write failing tests for paper units, finite positive scale denominators,
  oversized/undersized pages, paper-only fit, scale-only sizing and paper+scale
  rejection. Include equivalent `36x24in` / `914.4x609.6mm` inputs, malformed
  strings, zero, negative, NaN/infinity and actual output-path collision checks
  where that boundary is implemented in task 8.
- [x] Implement normal functions for parsing and size calculation, with millimetres
  as the internal physical unit. Use pyproj for geographic distances; do not
  duplicate geographic formulas in JavaScript. Core arithmetic is:

  ```python
  map_width_mm = ground_width_metres * 1000 / scale_denominator
  map_height_mm = map_width_mm * spec.height / spec.width
  css_width = map_width_mm * 96 / 25.4
  font_css_px = font_points * 96 / 72
  effective_dpi_x = raster_width_px / (map_width_mm / 25.4)
  ```

  A 100,000 m frame at 1:50,000 must be 2,000 mm wide. Compute centre east-west
  and north-south ratios and scale variation at both latitude bounds independently;
  do not describe the affine frame as an isotropic surveying projection.
- [x] Add one optional `map.print` manifest profile for static mode containing the
  requested paper/scale, physical typography/stroke constants and the resolved map
  rectangle when known. Keep geographic width/height/frame unchanged. Validate
  units and finite fields; normal static and interactive manifests omit the profile.
- [x] Establish a print hierarchy in points: 10 pt primary labels, 8 pt secondary,
  7 pt contours/credits minimum, 9 pt legend body and a larger title. Keep these
  values in one print style/profile owner. Reject an impossible collar fit instead
  of shrinking below the minimum. Express line widths and symbol sizes physically too.
- [x] Set a conservative initial maximum of 96 inches per page dimension, subject
  to the executable PDF/finalizer limit checks in tasks 7–8. Do not advertise it
  as supported until those checks pass. Test limit rejection before launching browsers.
- [x] Run `.venv/bin/python -m unittest discover -s tests/python -p 'test_print_sheet.py'`
  and `node --test tests/labels/schema.test.js`; commit.

**Done when:** Physical dimensions, point sizes, scale semantics and invalid-input
behavior have deterministic tests without opening a browser.

## Task 6: Compose the print sheet and its complete collar

**Files:** Modify `pipeline/cartography/print_sheet.py`,
`pipeline/cartography/furniture.py`, `pipeline/cartography/integration.py`,
`pipeline/cartography/scene.py`, `pipeline/build_region.py`,
`pipeline/build_static.py`; create `pipeline/cartography/print.css`;
extend `tests/python/test_print_sheet.py`, `tests/python/test_transport_legend.py`.

- [x] Add a shared argparse helper for internal builder flags `--print`, `--paper`,
  `--scale` and `--output` as applicable. The public interface remains `print:map`.
  Add `--output` to the authored static builder with its existing filename default;
  invoke it as a subprocess, never import its top-level data-loading code.
- [x] Write failing tests for every collar element and for symbol/legend agreement.
  Include a fixture with absent water, a restricted trail, two land-cover classes,
  a boundary type and an optional symbol rejected by placement. Test missing source
  dates/datum: unknown values must not become invented metadata.
- [x] Share legend entries with the existing style/symbol owners. Produce entries
  only for classes actually printed; distinguish layer geometry presence from
  optional symbols hidden by final placement. Preserve exact swatches, physical
  sizes, source semantics and the contour interval. Do not fork a second hand-coded
  symbol dictionary or copy the entire interactive legend prose.
- [x] Build one print HTML shell containing the SVG map and collar: title/date;
  external coordinate ticks and neatline; true north; dual-unit scale bars and
  nominal scale; contour/elevation information; coordinate/projection information;
  matching legend; credits/source dates; existing use notice; 100 mm calibration
  bar and actual-size printing instruction. Include a vertical datum only when
  supported by source metadata. Use an explicit light print theme.
- [x] Reserve a 6 mm trim-safe margin, title band and a measured wrapping collar.
  Measure the full potential legend before solving, reserving its space so hiding
  unused entries after placement cannot move the map. For paper-only fit, measure
  collar text at the fixed page width then fit the map. For scale-only, calculate
  map width first, measure the collar at that width, then derive page height.
  For paper+scale, measure and reject overflow. Use CSS layout and measured boxes.
- [x] Generate ticks from `MapSpec` through shared furniture functions; keep them
  outside the map label-placement rectangle. Remove/move the authored in-map
  cartouche/scale only in the print document so its collar does not duplicate them.
  Keep interactive UI and long tables out of the print shell.
- [x] Select only available contour levels and record the actual printed interval.
  Portable caches can supply 250/100/50 ft: filter by numeric elevation for a
  uniform selected interval instead of calling the union of 250 and 100 ft tiers
  a uniform 100 ft map. The authored static adapter currently supplies 250 ft only;
  retain and report that limit unless its producer is deliberately extended and tested.
- [x] Ensure print candidate preparation does not discard distance/text candidates
  using the current native-size `1x static` assumption before physical sizing.
  Let measured print-size eligibility/placement decide; preserve legacy static
  filtering when `map.print` is absent.
- [x] Run the print, furniture, transport-legend and authored/region builder Python
  checks. Confirm standard HTML composition has not acquired print-only furniture;
  commit.

  ```bash
  for suite in test_print_sheet.py test_map_furniture.py test_transport_legend.py test_builder_inventory.py test_region_builder.py; do
    .venv/bin/python -m unittest discover -s tests/python -p "$suite" || exit 1
  done
  ```

**Done when:** All three regions use the same print-sheet composer, whose collar
matches its actual cartography and whose staging metadata describes physical intent.

## Task 7: Place and freeze at the physical print size

**Files:** Modify `scripts/finalize-static.mjs`, `pipeline/labels/runtime.js`,
`tests/support/managed-map-adapter.js` only where the new measurement boundary
requires it; create `tests/browser/print-layout.spec.js`; extend
`tests/browser/static-layout.spec.js` and `docs/specs/map-layout.md`.

- [x] First build a small executable feasibility test: finalize the same SVG at
  two physical sizes without changing geographic coordinates. Check point labels,
  text on a path, authored sublabels, symbols and protected trails; retain the existing
  fixed-control regressions.
  Assert physical point/stroke sizes and anchor alignment are stable. Confirm
  current natural-size forcing fails this test before changing the finalizer.
- [x] Extend the existing finalizer with an optional print profile/reference size,
  keeping natural-size defaults unchanged. Await embedded fonts, measure the collar,
  resolve the physical map rectangle, update page/SVG CSS, and only then rerun layout.
  Both font probes and the final solve must use this same reference transform.
- [x] Handle static print sizing explicitly in controller `camera()`/`normalize()`:
  compensate text, symbols, halos and strokes for CSS-pixels-per-map-unit; apply
  the print point hierarchy and physical displacement/clearance values. Reuse the
  solver. Do not turn print into interactive mode or apply interactive zoom growth.
- [x] Base detail visibility and print contour selection on physical ground scale,
  not `W / view.w` (which remains 1 for a full-sheet print). Keep the full geographic
  viewBox and prevent responsive styles from letterboxing or stretching the map.
- [x] Freeze the resolved geometry and include physical page/map sizes, reference
  transform, point profile, interval, source hash and outcomes in the frozen report.
  Do not reset `--k`/`--s` to 1 if that would change already measured print geometry;
  test the serialized bytes, not only the pre-serialization browser state.
- [x] Run the existing independent static audits in all three engines/both theme
  environments with JavaScript/network disabled. Print's explicit light theme
  must stay stable in either environment. Preserve required labels, physical
  clearance and destination-on-failure behavior. Add collar bounds/tick checks
  separately; map annotation audits alone do not cover marginal text.
- [x] Run `npm run test:browser -- tests/browser/print-layout.spec.js tests/browser/static-layout.spec.js`.
  Update the frozen-static contract only for proven behavior and commit.

**Done when:** Cross-engine reopens reproduce the physical-size layout without
JavaScript, while existing natural-size static tests continue passing. If this
feasibility gate fails, do not proceed with screenshot-based PDF substitution.

## Task 8: Export and atomically validate the PDF

**Files:** Create `scripts/print-map.mjs`, `tests/labels/print-map.test.js`,
`tests/browser/print-pdf.spec.js`; modify `package.json` and
`docs/specs/map-data.md` for print artifact ownership.

- [x] Write failing tests for CLI validation, output/input path collisions, missing
  cache errors, failed PDF generation/inspection and preservation of an existing
  destination. Use the real small print fixture for browser/PDF tests; simulated
  subprocess failure is sufficient for the rollback branch.
- [x] Use Node argument parsing and `spawn`/`execFile` with argument arrays. Select
  the existing Python interpreter convention, build labels, invoke the appropriate
  static builder with shared print arguments into a unique staging path, then call
  `finalizeStatic`. The print command never fetches data or promotes `output/`.
- [x] Export the exact frozen bytes in a fresh Chromium page with JavaScript and
  external requests disabled. Load all embedded fonts, check images and bounds,
  and call `page.pdf` with explicit dimensions, matching CSS `@page`, scale 1,
  backgrounds enabled and browser headers/footers disabled. Use exact print colors;
  do not use `pageRanges: '1'` to conceal overflow pages.
- [x] Write to a unique temporary PDF beside its destination. Use `pdfinfo` to
  require one page and requested physical dimensions within 0.5 PDF point; use
  `pdffonts` to confirm fonts are embedded and `mutool` to inspect vector/text
  operations. Check a rasterization for terrain content and the calibration bar.
  Reject blank, clipped, unexpectedly rasterized or mis-sized output.
- [x] Write a sibling JSON report with source/staging/frozen/PDF hashes, browser
  version, geometry, scale variation, printed interval, font checks, real raster
  pixel sizes/effective DPI, source dates/gaps and audit results. Report raster
  ground sampling separately from DPI; legacy metadata may be unknown. Rename
  the PDF only after checks pass; clean temporary files and close resources on failure.
- [x] Run `node --test tests/labels/print-map.test.js` and
  `npm run test:browser -- tests/browser/print-pdf.spec.js --project=chromium`.
  Inspect 36 × 24 inch and 96-inch-limit fixture PDFs, including an over-limit
  rejection. If the declared limit fails, lower it and document the verified cap;
  preserve the 1:50,000 real-map acceptance requirement. Commit.

**Done when:** `npm run print:map` produces an inspected, vector-preserving PDF
and an evidence report, and failures leave an existing PDF untouched.

## Task 9: Acquire and check actual San Gabriel geography

**Files:** Review `pipeline/maps/san_gabriel.json`, existing source providers;
extend `tests/fixtures/cartography-scenes.json`; evidence under
`artifacts/regional-print/san-gabriel/`.

- [x] Run the explicit acquisition command from the target-interface section.
  If a service fails, retain successful caches and retry that provider using the
  existing `--source` option. Do not loosen hash, frame, no-data or pagination checks.
  If the larger area exposes a provider defect, add a focused regression and fix
  the shared provider; do not add a San Gabriel-specific query exception.
- [x] Review the proposed extent against the linked Forest Service reference and
  source-backed coordinates. Verify inclusion of Mount Wilson, Mount San Antonio,
  Mount Baden-Powell and representative river/trail/access areas. A frame change
  invalidates associated caches and requires reacquisition; label offsets cannot
  compensate for missing geography.
- [x] Inspect source records, all requested provider availability, rejected-feature
  counts, DEM shape/registration and actual ground sampling. Check narrow terrain
  and recognizable source features rather than relying on plausible summit heights.
  Record gaps and source dates without equating retrieval date with survey currency.
- [x] Build with `npm run build:maps -- --map pipeline/cache/san_gabriel/map.json`.
  Freeze a reviewed subset
  of real scene names/source IDs and expected feature classes in the existing scene
  fixture. Keep coverage status pending until matched-scale scenes have been reviewed.

**Done when:** The third candidate is generated from identified real inputs and
its representative geographic checks have recorded evidence. Network/coverage
gaps remain explicit and cannot be satisfied by synthetic fixtures.

## Task 10: Make regional rendering checks non-vacuous and run them

**Files:** Modify `scripts/audit-cartography.mjs`,
`scripts/fuzz-cartography-matrix.mjs`, `tests/fixtures/cartography-scenes.json`;
create `tests/labels/regional-coverage.test.js`; reuse
`tests/browser/regional-generation.spec.js`.

- [x] Add failing cases for an unknown map, empty scene list, missing expected
  feature and missing painted geometry kind. The current `regions[id] || []`
  behavior must not yield a successful empty run. Separate mechanical failure,
  unreviewed coverage and reviewed success in the result.
- [x] Export the small profile-selection/check functions from the existing audit
  script under its normal CLI guard, avoiding a separate validation framework.
  Add explicit `--map ID` selection to the fuzz matrix while retaining its default
  behavior and stable per-region/browser seeds. Discover selected maps from the
  same configuration set; report missing candidate files rather than silently skip.
- [ ] Exercise each selected region with SVG, Canvas and WebGL across the existing
  browser engines. Record requested versus active backend/fallback; an unavailable
  WebGL context is not evidence that WebGL paint passed. Include both themes,
  430/1440 px viewports, overview/dense ground scales, pan, zoom, toggles, place
  selection, reset and URL restoration using the existing harnesses.
- [ ] Run `node --test tests/labels/regional-coverage.test.js` and the regional
  browser fixture. Then run the actual candidate checks:

  ```bash
  PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/audit-cartography.mjs pipeline/san_gabriel_trails_interactive.html artifacts/regional-print/san-gabriel/coverage.json chromium
  PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/fuzz-cartography-matrix.mjs artifacts/regional-print/san-gabriel/fuzz --map san_gabriel
  ```

- [ ] Review the resulting scenes and flagged frames; tie findings to candidate
  hashes. Fix generic defects with a small failing fixture and rerun affected
  scenes. Commit code/fixtures, not downloaded data or bulky generated reports.

**Done when:** The third region demonstrably exercises generation and rendering;
missing scenes, empty output and backend fallback cannot masquerade as coverage.

## Task 11: Validate real posters and document the supported workflow

**Files:** Update `README.md`, `docs/index.md`, `docs/ADAPTING.md`,
`docs/LAYOUT_VALIDATION.md`, the two owning contracts and this plan's checkboxes.
Print operating instructions belong in the existing layout guide.

- [x] Export actual San Gabriel PDFs at 36 × 24 inches and nominal 1:50,000 using
  task 8's command. Review the complete poster and full-resolution crops of the
  collar, dense trails, labels and terrain. Record effective raster DPI; reject
  unreadable output rather than calling a successful PDF write print readiness.
- [ ] Exercise Grand Canyon and Sequoia through the same print command, using real
  caches when available. Verify Grand Canyon required names/routes and legacy
  editorial anchors, and confirm each map's collar describes its actual intervals
  and sources. Synthetic-only checks must be identified as such; real-data print
  acceptance remains incomplete for a region whose inputs are unavailable.
- [x] Run the regression suites once after shared changes:

  ```bash
  .venv/bin/python -m unittest discover -s tests/python
  npm run test:unit
  npm run test:browser -- tests/browser/regional-generation.spec.js tests/browser/print-layout.spec.js tests/browser/print-pdf.spec.js tests/browser/static-layout.spec.js tests/browser/cartographic-layers.spec.js
  git diff --check
  ```

  Broaden checks if failures or touched behavior justify it. Full map promotion
  still requires `npm run verify:maps` and `npm run promote:maps`; those cover the
  established Grand Canyon pair, not automatic approval of a new regional output.
- [x] Document one fresh-checkout route through prerequisites, explicit fetch,
  cached build, print export and inspection, including required PDF tools. State
  verified page limits, nominal-scale meaning, fixed versus available contour
  detail, raster limits, output names and report interpretation. Verify all
  published commands and local links before calling the guide current.
- [ ] Update plan progress with evidence paths and only completed checks. Report
  interactive HTML, frozen print HTML and PDF locations, checks performed,
  source gaps, remaining real-map validation and whether anything was promoted.
  Do not treat this task as authorization to bypass promotion checks or publish.

**Done when:** The requested third map and print feature have inspectable artifacts,
the collar and physical output pass their declared checks, and documentation
accurately separates implementation, geographic review and release status.

## Stop conditions and deferred work

- Physical-size freezing, actual PDF vector/font preservation and larger-region
  acquisition are feasibility gates, not assumptions established by this plan.
- A low-resolution terrain source can limit large-print quality even when vectors
  are sharp. Record the measured ceiling; tiled/higher-resolution acquisition needs
  its own scoped change if existing provider exports cannot meet the accepted sheet.
- A screenshot alone does not establish label collisions, interactions, geographic
  accuracy or print scale. Use each task's independent evidence.
- No requirement to modify unrelated performance targets, historic releases or
  existing roadmap statuses to complete this feature.

## Task 10 follow-up: materialize interactive buildings by viewport

**Status (2026-09-28): Implementation in progress; acceptance pending.** This is
scoped defect correction under task 10, not a completed scalability fix or a new release gate.
Execute with `superpowers:subagent-driven-development`; retain task 10's limits,
seeds, actions, backend accounting and independent audits.

**Problem and evidence boundary.** Interactive SHA `5da66938…` above contains
1,283,802 main-map paths, including 715,543 building paths: approximately 226.2 MB
of building markup, 79.5 MB of path data and 12.2 MB of source identities. All three
WebKit requests exceeded 120 seconds in navigation. With JavaScript disabled,
the same HTML reached load in 88.6 seconds while the main SVG stayed
`display:none`; that isolates a parsing baseline, not SVG layout cost. An
instrumented WebKit run entered runtime around 85 seconds, parsed the manifest
in 0.67 seconds and spent approximately 14 seconds in controller construction,
without finishing navigation. These observations motivate removing eager building
DOM/capture work; they do not prove it alone resolves startup. A fresh six-action
native-SVG replay passed on that old HTML, so its original layer watchdog is not
established as reproducible. The bounds-driven rebuild SHA
`0e365051607951f704a39f9bbcd41524028c45fa43d75419f7c267fcc78fbb98`
contains the mobile CSS fix and a rebuilt runtime, not this building change. The
[byte comparison](../../artifacts/regional-print/resume-20260928/candidate-css-lineage.json)
confirms all other bytes are unchanged. The original-name font-probe fix belongs
to static finalization. Recompiling source before `befc274` reproduces the old
runtime; that commit adds the physical-print point-envelope support in the rebuilt
bundle. Neither byte comparison transfers mechanical acceptance.

**Chosen boundary.** Keep every exact emitted building `d`, attribute, source
identity and paint position in inert, bounded JSON chunks; materialize only the
scale-eligible polygons intersecting the current viewport. Reuse `SpatialIndex`,
SVG creation and Canvas capture. A controller-owned building helper survives
renderer fallback. Static/PDF polygons and building-associated facilities and
annotations remain on their existing paths. Do not add another renderer, worker,
tile protocol, dependency, geometry simplification or persistent cache format.
Merely hiding SVG paths or skipping Canvas capture would retain the initial DOM
cost; a general lazy-geometry framework would expand this bounded change.

### Owners and compatibility

| Files | Change and affected consumers |
|---|---|
| `pipeline/cartography/scene.py`, `pipeline/cartography/integration.py` | Shared producer used by both `build_region.py` and `build_interactive.py`; existing `catalog_panel(context)` emits inert chunks. Static callers retain inline geometry. |
| New `pipeline/render/buildings.js` | Building-only validation/index, cancellable preparation, retained nodes and per-view readiness; reuse `pipeline/labels/spatial-index.js`. |
| `pipeline/labels/runtime.js` | Own helper lifetime, native-camera transaction, pending/idle state and dynamic eligibility. |
| `pipeline/render/scene.js`, `pipeline/render/canvas-renderer.js` | Exclude the designated group from full-scene capture; prepare current buildings through existing capture/paint and readiness boundaries. WebGL shares this foreground. |
| `tests/python/test_cartographic_scene.py`, `tests/python/test_region_builder.py`; new `tests/browser/building-materialization.spec.js` | Exact producer preservation and one small backend-parameterized integration fixture, using existing browser support. |
| `docs/specs/map-data.md`, `docs/specs/map-layout.md`, `docs/RENDERING_BACKENDS.md` | Payload boundary, per-view readiness/inventory semantics and implemented backend explanation, updated only when installed. |

The source inventory remains complete even when the materialized DOM is partial.
`audit-cartography.mjs` must still observe actual `.area-building` elements and
`data-source-id` through native paint or `renderer.paintedGeometry`; indexed
records never count as painted. Existing annotation identities, connected
measurement sources and all contour hydration/completion guarantees remain.
`Manifest.finalize()` does not consume unannotated building polygons in interactive
mode: its relevant work concerns text references, annotations and trail obstacles.
Both interactive builders emit `catalog_panel()` before `layout_script()`, so all
chunks precede controller construction. Preserve these ordering facts in fixtures.
Legacy HTML without this payload follows its existing inline path. Newly emitted
HTML bundles its matching runtime; do not silently accept unknown payload versions.

### Implementation sequence (each increment remains buildable)

1. **Add the isolated consumer before changing generated output.**
   - [ ] Add the small browser fixture with an empty designated `.buildings`
     group, inert payload, disjoint polygons, a hole, a multipolygon and a polygon
     just beyond the view whose stroke intersects it. First demonstrate the
     missing materialization/readiness behavior; do not benchmark this fixture.
   - [ ] Implement `buildings.js`: parse the existing `json_script` representation
     and validate version, finite
     bounds, path strings and permitted original attributes before publishing a
     ready index. Use native JSON parsing and index cooperatively; malformed/missing data produce an
     explicit geometry error, never an empty successful view. Release consumed
     script text; retain the canonical exact path/source records and index.
   - [ ] Select by existing `data-max-mpp` semantics and effective viewport scale.
     Query conservatively for `.001` coordinate rounding plus stroke/miter
     reach, exact-filter candidates, and sort record indices into source paint
     order. Reuse retained nodes/captures; evict abandoned ones. Keep at most the
     committed set and current preparation, not every visited view. Cancel stale
     view/theme work and final-pagehide work; preserve persisted-page behavior.

2. **Wire complete-view transactions while ordinary builds remain inline.**
   - [ ] Integrate the helper into controller initialization and idle/error state.
     Native SVG prepares off-paint and commits the building set with its camera,
     including `paintStartupCamera()`, settled rendering, resize and fallback.
     Keep the previous complete view until the new set is ready. The helper owns
     dynamic building eligibility; exclude its nodes from `updateDetail()`'s
     permanent cached element list. Facilities/annotation handling is unchanged.
   - [ ] Exclude only the designated building group from `MapScene.prepare()`.
     Reuse `captureCommands` and the existing constant-stroke normalization for
     new or theme-invalidated buildings during preparation, outside fast camera
     frames. Feed ordered records into the existing buildings paint slot and
     `paintedGeometry`; do not rebuild the full scene for a pan or double-paint.
   - [ ] Extend `ensureView()`/`isViewReady()` for buildings even when contours are
     disabled or `geometryComplete` is true. Include `x/y/w/h`, effective viewport
     scale and invalidating generation in camera preparation identity. Publish
     `paintedView`/`paintedRevision` only after the complete requested geometry.
     Tie pending work into `whenSettled()`; contour background completion still
     means its existing full inventory, not all buildings materialized at once.
   - [ ] Make theme refresh and renderer destruction invalidate stale captures;
     retain the controller helper through Canvas-to-native fallback and prepare
     its current view before exposing SVG. GPU-to-Canvas fallback keeps the same
     foreground. Delay one preparation deliberately and prove no stale camera,
     partial set or obsolete theme can commit, including during initial load.

3. **Switch the shared producer once all consumers understand the payload.**
   - [ ] Extend Python regressions before emission changes: exact path/attribute
     reconstruction, source paint order, holes/multipolygons, conservative bounds,
     unsafe JSON text escaping, selected counts, and facility/name preservation.
     Compare static output with the current inline representation.
   - [ ] In `scene.py`, attach transient bounds from the same projected polygon
     only for interactive buildings. In `improve()`'s existing parsed tree,
     extract the exact paths/attributes in order, remove the transient attribute
     and building children, and retain the designated group in its original slot.
     Carry the payload in returned context, not persisted scene reports/catalog
     metadata. `catalog_panel()` uses existing `json_script` to emit bounded
     chunks. Validate equality of the existing common class/style/detail/fill-rule
     attributes explicitly and store them once; each row needs only exact `d`,
     source identity and bounds, with array order defining paint order. Unexpected
     attributes or differences fail extraction rather than introducing hypothetical
     variants/configuration. Keep `render_poi()` running independently for building
     facilities. No new builder arguments or duplicated authored/regional emission
     path are needed.
   - [ ] Extend the regional fixture to assert empty initial interactive building
     DOM with a complete indexed inventory after startup and unchanged inline
     static/print geometry. Update the contracts/explanation listed above with
     the installed schema and distinction between indexed and materialized data.

4. **Verify behavior, then measure the actual regional candidate.**
   - [ ] Run narrow checks first; run browser workloads sequentially in tmux:

     ```bash
     .venv/bin/python -m unittest discover -s tests/python -p 'test_cartographic_scene.py'
     .venv/bin/python -m unittest discover -s tests/python -p 'test_region_builder.py'
     npm run build:labels
     npm run test:browser -- tests/browser/building-materialization.spec.js --workers=1
     npm run test:browser -- tests/browser/canvas-renderer.spec.js tests/browser/webgl-renderer.spec.js tests/browser/regional-generation.spec.js tests/browser/print-layout.spec.js --workers=1
     git diff --check
     ```

     The new fixture requests SVG/Canvas/WebGL in all three engines and records
     actual backend. Check disjoint same-zoom pans, threshold crossings and resize,
     edge stroke, source/order/attribute equality, theme refresh, retained-node
     reuse and eviction, delayed readiness, fallback and final-pagehide cleanup.
     Use independent paint collection, not indexed presence as visibility proof.
   - [ ] Rebuild through the same selected-bounds cached public route and record
     new hashes, HTML bytes, indexed/materialized counts and startup phase times.
     Repeat real WebKit navigation and task 10's unchanged audit/fuzz commands on
     that exact candidate, then review completed and flagged frames. Preserve old
     reports; no watchdog, zoom, data or geometry reductions to obtain a pass.
   - [ ] Record observed benefit and residual costs separately. Parsing/indexing
     still covers the complete building inventory; other paths, annotations and
     the detail inset remain eager. If real navigation or interaction still fails,
     keep acceptance pending and diagnose that measured remainder. Fixture passes
     alone establish neither regional acceptance nor the separate 3× startup goal.

**Completion evidence:** exact producer preservation, atomic current-view paint in
all requested backend paths, bounded retained geometry across pans, unchanged
static/print behavior, and fresh real-candidate navigation/interaction outcomes.
No output promotion or hosted publication is authorized by this follow-up.
