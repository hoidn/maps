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
acquisition/acceptance is in progress. Nothing has been promoted or published.

**User clarification:** New maps start from a selected area/bounding box. A checked-in
San Gabriel preset alone does not establish automated region setup. The generic command
derives its specification and dimensions; the real third-map proof must use this path.

**Current evidence:** `artifacts/regional-print/` records 182 passing Python and
183 passing Node checks, verified 36 × 24 and 96 × 60 inch fixture PDFs, and a complete
unregistered-area generation test. Authored Grand Canyon print serialization now passes
all six independent browser/theme audits after a CSS precision fix. A representative
collar fixture covers absent water, restricted paths, two land-cover classes, a boundary,
placement-hidden facilities and missing source metadata. The final browser regression passed 40 checks, with 20 deliberate duplicate skips. Real San Gabriel OSM acquisition retained its checkpoints after detecting a
conflicting object at the declared snapshot; investigation continues.
Real Grand Canyon/Sequoia caches are absent; their real-map print acceptance is pending.

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
- [ ] Run actual San Gabriel through this command with its original approved bounds and
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

- [ ] Run the explicit acquisition command from the target-interface section.
  If a service fails, retain successful caches and retry that provider using the
  existing `--source` option. Do not loosen hash, frame, no-data or pagination checks.
  If the larger area exposes a provider defect, add a focused regression and fix
  the shared provider; do not add a San Gabriel-specific query exception.
- [x] Review the proposed extent against the linked Forest Service reference and
  source-backed coordinates. Verify inclusion of Mount Wilson, Mount San Antonio,
  Mount Baden-Powell and representative river/trail/access areas. A frame change
  invalidates associated caches and requires reacquisition; label offsets cannot
  compensate for missing geography.
- [ ] Inspect source records, all requested provider availability, rejected-feature
  counts, DEM shape/registration and actual ground sampling. Check narrow terrain
  and recognizable source features rather than relying on plausible summit heights.
  Record gaps and source dates without equating retrieval date with survey currency.
- [ ] Build with `npm run build:maps -- --map san_gabriel`. Freeze a reviewed subset
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

- [ ] Export actual San Gabriel PDFs at 36 × 24 inches and nominal 1:50,000 using
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
- [ ] Document one fresh-checkout route through prerequisites, explicit fetch,
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
