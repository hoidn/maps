# Automatic Map Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Automatically place and validate map annotations, preventing forbidden overlaps at
every displayed interactive view and failing static builds that lose required information.

**Architecture:** Python builders emit an annotation manifest beside existing SVG geometry.
A shared JavaScript engine measures and places annotations for the explorer and a headless
static finalizer. An independent browser audit checks final rendered geometry and information
coverage before candidate files can replace the delivered outputs.

**Tech Stack:** Existing Python/numpy/SVG pipeline; plain JavaScript ES modules; Node test
runner; Playwright; development-only esbuild; embedded versioned fonts; JSON diagnostics.

**Status:** Draft, 2026-09-08. This document defines proposed files and commands; they do not
exist yet unless identified as current files. No implementation or map regeneration is part
of drafting this plan.

**Design:** [Automatic map layout and validation](2026-09-08-automatic-map-layout-design.md)

## Execution boundaries

- Read `HANDOFF.md`, `docs/DESIGN.md`, `docs/PROCESS.md` and the companion design first.
- Before implementation, use `superpowers:using-git-worktrees` for an isolated feature
  branch and `superpowers:test-driven-development` for behavior changes. This draft is
  documentation in the existing workspace; it does not create a feature branch.
- Implement tasks in dependency order. Each numbered step is a separate action; add the
  named edge-case tests incrementally rather than writing a large unverified patch.
- Run the targeted failing test, implement enough to satisfy it, then run its focused suite.
  Milestone integration checks supplement those tests; avoid repeatedly fetching live data.
- Commit each completed task with the suggested message after its checks pass. These are
  implementation checkpoints, not instructions to commit an unreviewed design draft.
- Do not publish hosted artifacts. Local promotion into the existing `output/` filenames
  happens only in Task 12 after verification.
- Do not introduce region-boundary inference, arbitrary POI clustering, automatic print
  insets, source-data correction, a GPU rewrite or an AI review service into this scope.

## Fixed contracts to implement

### Engine API

Keep the placement solver independent of DOM access and clocks:

```js
// Inputs contain already-measured candidates in CSS screen coordinates.
// Lower sort rank means greater importance; policy maps feature priorities to rank.
export function solveLayout({ annotations, obstacles, viewport, previous, policy }) {
  // Return one outcome for EVERY input annotation, including hidden annotations.
  // { placements: [{ id, candidateId, footprint, transform, variantId }],
  //   outcomes: [{ id, reason, blockerIds }], missingRequired: [] }
}
```

The code above defines an interface, not the algorithm. Implement deterministic candidate
enumeration and acceptance, then bounded local repair as described in the design. Every
candidate must be tested against hard obstacles and accepted annotations before insertion.

### Proposed diagnostic schema

```json
{
  "schemaVersion": 1,
  "artifactSha256": "computed-from-audited-bytes",
  "policySha256": "computed-from-policy-bytes",
  "view": {"x": 0, "y": 0, "zoom": 1},
  "profile": "interactive-desktop",
  "viewport": {"width": 1440, "height": 1000, "dpr": 1},
  "theme": "light",
  "inventory": {"total": 0, "eligible": 0, "visible": 0, "unknown": []},
  "collisions": [],
  "clipped": [],
  "missingRequired": [],
  "coverageByClass": {},
  "outcomes": [],
  "timings": {},
  "fontHashes": {},
  "browser": {"name": "record-at-runtime", "version": "record-at-runtime"},
  "status": "pass-or-fail-or-incomplete"
}
```

Empty arrays here illustrate fields, not a passing result. Inventory must reject an
unexpected empty map, unknown managed elements and incomplete measurements.

### Proposed commands

Create root `package.json` with `private: true`, `type: "module"` and these scripts as their
implementations land. Use compatible pinned development dependencies and commit the lockfile.
Record a supported Node version after checking the chosen packages' requirements in Task 1.

```json
{
  "private": true,
  "type": "module",
  "scripts": {
    "build:labels": "node scripts/build-labels.mjs",
    "test:unit": "node --test tests/labels/*.test.js",
    "test:browser": "playwright test",
    "audit": "node scripts/audit-map.mjs",
    "layout:static": "node scripts/layout-static.mjs",
    "verify:maps": "node scripts/verify-maps.mjs"
  }
}
```

Run all commands below from the repository root unless a `cd` is shown. Browser tests should
start a local fixture server through Playwright configuration; do not require an unexplained
background process or fixed external site. The audit CLI manages its own loopback server for
input artifacts and cleans it up on success/failure. Bind only to loopback.

## Milestone A — reproducible baseline

### Task 1: Introduce a read-only browser audit and test harness

**Create:** `package.json`, `package-lock.json`, `.node-version`, `playwright.config.js`,
`scripts/audit-map.mjs`, `tests/support/legacy-map-adapter.js`,
`tests/support/reference-geometry.js`, `tests/browser/audit.spec.js`,
`tests/fixtures/layout-overlap.html`, `tests/fixtures/layout-baseline.json`.
**Modify:** `.gitignore` for dependencies, bundles and diagnostic output; explicitly permit
checked-in PNG fixtures under `tests/` despite the existing global `*.png` rule.
**Read:** both current HTML files in `output/`, the map group assembly in both builders.

1. Install compatible development dependencies (`npm install --save-dev --save-exact
   @playwright/test esbuild`), pin the supported Node version, and install browsers with
   `npx playwright install chromium firefox webkit`. Configure Chromium smoke and three
   engine release projects; do not use live terrain fetches in tests.
2. Create a tiny SVG fixture with two known overlapping labels, a clipped label, rotated
   text and an intentionally associated contour number. Add a test that invokes the audit
   and asserts the actual offending IDs and clipped element. Run
   `npx playwright test tests/browser/audit.spec.js --project=chromium`; expect failure
   because the audit entry point/behavior is missing.
3. Implement the legacy inventory adapter, independent rectangle/polygon reference checks,
   artifact serving, font readiness checks and JSON/annotated-image reporting. Audit visible
   map text/symbols and fixed controls; do not count decorative paths inside one symbol as
   separate POIs. Unknown ownership is an unresolved finding, not a guessed exemption.
4. Rerun the fixture tests. Then run the two commands below and inspect every report. The
   existing maps are expected to contain findings; retain actual counts and artifact hashes
   in `layout-baseline.json`. If intended fonts cannot load, record `incomplete` and repeat
   after Task 3. Do not manufacture an overlap count or assert that the legacy maps pass.
5. Commit: `test: add rendered map layout audit and baseline`.

```bash
npm run audit -- --input output/grand_canyon_trail_sheet_static.html --mode legacy --report artifacts/layout/baseline-static
npm run audit -- --input output/grand_canyon_trail_explorer_interactive.html --mode legacy --zoom-samples 1,2,4.5,6,14 --report artifacts/layout/baseline-interactive
```

**Exit behavior:** audit exits nonzero for findings/incomplete measurements, while still
writing diagnostics. Tests assert those expected failures. Baseline records are evidence,
not an allowlist to carry old collisions into the final gate.

### Task 2: Emit a complete, stable annotation manifest

**Create:** `pipeline/label_manifest.py`, `pipeline/labels/schema.js`,
`pipeline/labels/policy.json`, `tests/python/test_label_manifest.py`,
`tests/labels/schema.test.js`, `tests/fixtures/annotation-manifest.json`,
`tests/fixtures/mini-map-data/` with the smallest synthetic OSM/terrain/DEM inputs needed by
the existing builders, and `tests/support/build-fixture.py` to construct those inputs.
**Modify:** both builders' label helpers, `place()`, standalone symbol calls, peaks, regions,
trail-label selection, hydro/contour labels, SVG assembly and `PLACES` construction.

1. Write manifest tests for stable IDs under changed source order, repeated trail annotations,
   complete inventory, same-place facility ownership and non-finite coordinates. Include a
   name containing `</script>` and a directory feature with no visible label. Run
   `python3 -m unittest discover -s tests/python -p 'test_label_manifest.py'` and
   `node --test tests/labels/schema.test.js`; expect the missing schema/helper failures.
2. Implement manifest construction/validation and inert JSON serialization. Preserve current
   coordinates and preferred offsets; give every label/symbol an ID and explicit relationship.
   Reference rendered line geometry by ID instead of duplicating all contour paths in JSON.
3. Extend tests to identify *all* map annotation classes, including bridge/spring names,
   elevation sublabels, off-frame arrows, repeated contours and water-only facilities.
   Treat the title/scale panel as one obstacle with internally checked UI content. Build the
   miniature input fixture in a temporary directory; fixture generation must not use network.
4. Rerun Python/schema tests, then audit the fixture-generated HTML and compare geometry to
   its pre-manifest rendering. Expected: IDs/metadata added, no accidental coordinate or
   content changes, no unclassified annotation elements. Real-data regeneration remains
   optional until Task 12 because intermediates are absent from the checkout.
5. Commit: `refactor: describe map annotations with a shared manifest`.

**Stop condition:** do not move on to claiming complete coverage if any annotation group is
still outside the manifest. Hard-coded geographic anchors may remain; hard-coded preferred
text offsets become candidate metadata rather than mandatory final positions.

## Milestone B — measured geometry and automatic placement

### Task 3: Make fonts and browser measurements reproducible

**Create:** `pipeline/labels/measure.js`, `pipeline/labels/fonts/` with the actual required
font faces and notices, `tests/browser/measurement.spec.js`,
`tests/fixtures/text-measurement.html`.
**Modify:** both builders' Google Fonts imports and embedded CSS; legacy audit's optional
local-font override for reproducible baseline comparison.

1. Add tests for intended-font failure, delayed fonts, multiline labels, italic overhang,
   rotation/parent transforms, strokes/halos and combining characters. Run
   `npx playwright test tests/browser/measurement.spec.js --project=chromium`; expect failures
   for missing metrics and font readiness handling.
2. Obtain redistributable Source Sans 3, Alegreya italic and Bree Serif assets from official
   sources, retain notices and record hashes. Embed only required faces/character coverage.
   Check font availability explicitly after readiness. Avoid a fallback-font flash of labels.
3. Implement conservative point/rotated/multiline footprints and curved-text character/run
   footprints, including path-end overflow checks. Use a conservative whole-label bound when
   precise glyph measurement is unsupported. Cache by text, complete style and font hash.
4. Run the measurement suite across all three browser projects with network blocked. Expected:
   painted test glyphs fit inside measured bounds; missing fonts produce an explicit error;
   curved text does not occupy the empty center of a winding path unnecessarily. Complete
   or refresh the Task 1 baseline under the recorded pinned fonts.
5. Commit: `feat: measure annotations with embedded deterministic fonts`.

### Task 4: Implement screen geometry and a conservative spatial index

**Create:** `pipeline/labels/geometry.js`, `pipeline/labels/spatial-index.js`,
`tests/labels/geometry.test.js`, `tests/labels/spatial-index.test.js`.
**Modify:** browser measurement adapter to use the production transform contract; keep
`tests/support/reference-geometry.js` independent of the optimized index/predicates.

1. Add tests for exact clearance boundaries, rotated corners, halo width, viewport clipping,
   line-stroke intersections and simplification-error inflation. Add seeded random scenes
   comparing indexed collision candidates with the independent all-pairs implementation.
   Run `node --test tests/labels/geometry.test.js tests/labels/spatial-index.test.js`;
   expect failures for missing exports.
2. Implement transform/shape predicates and a simple uniform screen grid. Validate inputs;
   reject NaN, infinities and invalid dimensions. Insert/query entire padded footprints,
   including objects spanning multiple cells and those at negative viewport coordinates.
3. Add semantic exception tests: a contour number can follow its own contour but still
   cannot cover a trail; facility icons can share a place but cannot overlap each other;
   POI/trail ownership permits only the intended local anchor intersection.
4. Rerun unit and measurement suites. Expected: no missed collisions against the reference,
   stable results at numeric boundaries, and no broad exemption based only on layer names.
5. Commit: `feat: enforce annotation collision geometry and spacing`.

### Task 5: Place point labels and facility groups by priority

**Create:** `pipeline/labels/candidates.js`, `pipeline/labels/place.js`,
`tests/labels/placement.test.js`, `tests/fixtures/point-cluster.json`.
**Modify:** `pipeline/labels/policy.json` with initial sizes, clearances, priorities and
explicit static requirements; preserve them as draft policy until scene evaluation.

1. Add behavioral tests for alternate anchors, approved shorter variants, impossible
   required placement, optional suppression, input-order determinism and stable previous
   candidates. Run `node --test tests/labels/placement.test.js`; expect missing-solver failures.
2. Implement eight anchors plus bounded alternatives and facility arrangements. Greedily
   place required/high-priority annotations first, maintaining one valid candidate per
   annotation and a typed outcome for every rejected one. Do not shift true feature anchors.
3. Add a fixture where moving one optional neighbor allows a required name to fit; implement
   bounded deterministic local repair. Add a fixture where no candidate fits and assert an
   explicit required miss rather than an overlap, tiny font or silent omission.
4. Rerun placement/geometry tests. Expected: `placements` satisfy hard rules, required misses
   are reported, and identical inputs/policy/previous state yield identical candidate IDs.
   Directory membership must be independent of `placements`.
5. Commit: `feat: place point annotations with priority and coverage rules`.

Representative test to add once fixture helpers exist:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { solveLayout } from '../../pipeline/labels/place.js';
import { impossibleRequiredScene } from '../support/layout-fixtures.js';

test('an impossible required name is reported without painting a collision', () => {
  const scene = impossibleRequiredScene();
  const result = solveLayout(scene);
  assert.deepEqual(result.missingRequired, ['required-stop']);
  assert.equal(result.placements.some(p => p.id === 'required-stop'), false);
  assert.equal(result.outcomes.find(o => o.id === 'required-stop').reason,
    'no-valid-candidate');
});
```

Create `tests/support/layout-fixtures.js` with this and subsequent solver fixtures; fixtures
describe geometry and intended results independently of the algorithm's candidate ordering.

### Task 6: Add trail, curved-water, contour and region placement

**Modify:** `pipeline/labels/candidates.js`, `place.js`, `measure.js`, `policy.json`, and both
builders' line/region metadata if the prior manifest needs more path-window information.
**Create:** `tests/labels/line-candidates.test.js`, `tests/browser/line-layout.spec.js`,
`tests/fixtures/curved-labels.html`, `tests/fixtures/region-anchors.json`.

1. Write failing tests for upright trail names, sufficient usable line length, tight curves,
   repeated labels, path overflow, river-label vs trail conflicts and bounded region moves.
   Run `node --test tests/labels/line-candidates.test.js` and
   `npx playwright test tests/browser/line-layout.spec.js --project=chromium`.
2. Generate several measured line windows and side offsets; score curvature, reading
   direction and distance to existing preferred windows. For curves, retain path-based text
   and use measured run footprints. Sample nearby protected trail segments conservatively.
3. Implement per-feature repeat spacing and contour-tier eligibility. Add bounded region
   displacement/rotation around existing editorial anchors and explicit clipping rules for
   edge pointers. Emit reasons when the available region information allows no valid move.
4. Run line, placement and three-engine measurement tests. Expected: all map annotation types
   participate in the same collision rules; contour density does not create an all-vertices
   hard-obstacle index; no hidden class is reported as permanently solved.
5. Commit: `feat: place line and region labels with shared collision rules`.

**Milestone B review:** evaluate candidate coverage in the four dense scenes named in the
design. Build small browser fixtures from their actual labels and projected anchors in the
builders, with synthetic background/path obstacles where necessary; import the ES modules
directly through the fixture server, so this check does not depend on Task 7's bundle or on
downloaded DEM data. These fixtures test local layout, not full-map terrain readability.
Inspect annotated coverage diffs and set explicit fixture minima in
`tests/fixtures/layout-policy-scenes.json`. Record why each static requirement or size value
was chosen; retain failing cases until fixed. Do not relax hard collision rules.

## Milestone C — integrate both output modes

### Task 7: Bundle the engine and establish a browser layout lifecycle

**Create:** `pipeline/labels/browser.js`, `scripts/build-labels.mjs`,
`tests/browser/layout-lifecycle.spec.js`.
**Modify:** both builders to embed `pipeline/labels/dist/browser.js` into staging outputs,
`package.json`, `.gitignore`, and fixture build support.

1. Add tests that a generated fixture waits for fonts, validates its manifest and reaches
   a settled layout with every annotation accounted for. Test unavailable metrics and
   zero-inventory failure. Run
   `npx playwright test tests/browser/layout-lifecycle.spec.js --project=chromium`; expect
   failure because no browser layout entry point exists.
2. Implement the ES-module bundle as an inline IIFE with a small namespace, not globals for
   every helper. Embed it and the policy/manifest safely. The delivered HTML makes no script
   or font network requests. Missing build bundles must produce a useful build error.
3. Connect measurement, candidate generation and solver results to DOM annotation transforms.
   Start managed annotation groups hidden; reveal only a validated layout. Expose read-only
   diagnostics in production and extra test hooks only in test/staging mode. The independent
   audit must also work without those hooks.
4. Run `npm run build:labels`, lifecycle tests and prior focused suites. Expected: staging
   maps work with network blocked, error states preserve a plain directory, and absence of
   test hooks in production does not prevent auditing the visible DOM.
5. Commit: `feat: embed the shared label engine into generated maps`.

### Task 8: Make interactive camera and annotation updates one transaction

**Create:** `pipeline/labels/runtime.js`, `tests/browser/interactive-layout.spec.js`,
`tests/browser/frame-layout.spec.js`.
**Modify:** `pipeline/build_interactive.py`'s `apply()`, wheel/pointer handlers, layer toggles,
view-hash restoration, search, annotation CSS scaling, readout and tooltip placement.

1. Write tests for a collision at an intermediate zoom even when endpoint layouts pass,
   rapid reversal across 2×/4.5×, the 1.02× cartouche boundary, layer changes during motion,
   and resize with the popup open. Capture paint-aligned visible DOM states throughout the
   gesture, not just after idle. Run
   `npx playwright test tests/browser/frame-layout.spec.js --project=chromium`; expect the
   old immediate-viewBox behavior to fail the constructed transition fixture.
2. Refactor handlers to update pending state. In one pre-paint transaction, compute the exact
   requested camera/tier/obstacle state, derive valid placement and synchronously commit both.
   No promise or delayed placement step may expose a new camera with stale label visibility.
   Revalidate a previous placement before reusing it; keep candidate IDs stable when valid.
3. Add font/viewport/obstacle invalidation and stale-result rejection. Optional work may be
   deferred only after suppressing or validating affected annotations for the new view.
   Keep enough extra clearance before showing a previously hidden optional label to reduce
   flicker. Avoid position transitions and overlapping crossfades in the first release.
4. Make all manifest directory features searchable, including hidden bridges/springs. A
   selection displays full details in a reserved adjacent region if its map label cannot
   fit. Move hover details there if necessary; reserve/clamp any tooltip remaining on-map.
   Run interactive/frame tests in the full three-engine matrix. Expected: no sampled painted
   frame has forbidden overlaps, UI geometry stays inside its container, and existing
   pan/zoom/pin/search/hash/readout behavior remains functional.
5. Commit: `feat: validate map labels throughout interactive view changes`.

Frame tests must use the independent DOM auditor; calling `solveLayout()` again and checking
its returned collision array is not an independent test. Verify hook ordering with a known
one-frame defective fixture so the test would actually catch the regression it claims to catch.

### Task 9: Bake and independently verify the static layout

**Create:** `scripts/layout-static.mjs`, `tests/browser/static-layout.spec.js`.
**Modify:** `pipeline/build_static.py` staging output mode and static policy requirements.

1. Add tests for a finalized output that renders with JavaScript disabled, missing required
   static labels, a missing font, and a collision introduced only after serialization.
   Run `npx playwright test tests/browser/static-layout.spec.js --project=chromium`;
   expect missing finalizer behavior.
2. Implement a CLI that loads staging HTML, solves at the declared static map width, bakes
   accepted transforms/variants/path offsets, removes the layout runtime dependency and
   writes a temporary candidate file. Preserve the existing unrelated profile interaction.
3. Reopen the serialized candidate with JavaScript disabled and network blocked. Independently
   remeasure in Chromium, Firefox and WebKit; check required names, collisions, paint padding,
   uniform scaling and both themes. Missing requirements or font failure must stop output
   replacement. Do not introduce an automatic inset generator to hide this failure.
4. Run static tests and audit the fixture's finalized bytes. Expected: baked labels retain
   valid positions without startup layout, reports refer to the serialized artifact hash,
   and a failed export preserves the prior destination file.
5. Commit: `feat: finalize static labels into validated SVG positions`.

```bash
npm run layout:static -- --input pipeline/grand_canyon_trails.staging.html --output pipeline/grand_canyon_trails.html --profile static-default
```

This is the eventual real-data command. During tests, use the temporary fixture output paths.
The static HTML profile's reference size is not yet a promise about Avenza or PDF print size.

## Milestone D — release coverage, performance and delivery

### Task 10: Finish the independent audit and regression matrix

**Modify:** `scripts/audit-map.mjs`, `tests/support/reference-geometry.js`,
`playwright.config.js`, `tests/browser/audit.spec.js`, `tests/fixtures/layout-policy-scenes.json`.
**Create:** `tests/browser/layout-matrix.spec.js`, `tests/browser/interaction-regression.spec.js`,
`tests/browser/visual-layout.spec.js`, `tests/support/frame-auditor.js`.

1. Add failing audits for an omitted required label, all optional labels hidden, a manipulated
   solver diagnostic reporting success, an unknown annotation element and a stale policy hash.
   Run the audit tests; each defect must be detected from rendered DOM plus the independent
   manifest/policy inventory, without trusting placement success flags.
2. Complete curved/rotated glyph, facility, line-obstruction and UI footprint auditing. Produce
   reasoned JSON and a compact HTML report with numbered screenshots. Add reference tests
   showing conservative shapes contain rendered paint and intentional exceptions are local.
3. Encode the release matrix: three engines; 360×800, 768×1024 and 1440×1000; DPR 1/2; light/dark;
   named dense scenes; zoom boundaries and extremes; 250 seeded random states; at least 100
   paint-aligned samples per gesture scenario. Keep a focused smoke subset separate from the
   expensive matrix. Record any synthetic-touch versus real-device coverage limits.
4. Run `npm run test:unit`, Python manifest tests and `npm run test:browser`. Expected: no hard
   failures, explicit coverage minima met, search/pin/reset/hash/layers/readout assertions pass.
   Generate screenshot baselines only after geometric tests pass; review the small set of
   overview/dense-area images and store them for the pinned environment. Unexpected screenshot
   changes are investigated, not automatically accepted.
5. Commit: `test: gate rendered maps on geometry and information coverage`.

### Task 11: Measure and bound runtime cost without weakening correctness

**Create:** `scripts/benchmark-layout.mjs`, `tests/browser/layout-performance.spec.js`,
`tests/fixtures/layout-performance-profile.json`.
**Modify:** metrics/index/candidate/runtime modules only where profiling demonstrates need.

1. Record reference hardware, OS, browser, viewport, artifact hash and warm/cold conditions.
   Benchmark the pre-change delivered explorer and candidate version with the same gesture.
   Separate layout CPU time, measurement cost and total frame intervals. Use miniature fixtures
   for deterministic tests and the real map for contour-paint performance.
2. Add tests for stale asynchronous results and budget fallback: construct a case where optional
   candidate enumeration is cut short, and require every displayed footprint to be valid in
   the latest view. Do not use flaky millisecond assertions as unit tests. Run the focused
   runtime suite and confirm the deliberately defective fallback fixture fails.
3. Optimize cached text metrics, path sampling, nearby obstacle queries and coalesced input
   only as needed. Interactive fast placement may defer local repair; static placement may
   spend more time improving coverage. Avoid repeated synchronous DOM reads per candidate.
4. Run `node scripts/benchmark-layout.mjs --input pipeline/grand_canyon_trails_interactive.html
   --report artifacts/layout/performance` after real intermediates are available in Task 12,
   or the fixture equivalent now. Evaluate the draft p95 8 ms transaction / 33 ms frame and
   100 ms settled-layout targets. Record measurements; freeze the reference profile before
   release. If contour painting prevents the target, report a distinct unmet performance
   criterion and address the bottleneck before claiming completion.
5. Commit: `perf: bound annotation work during map interactions`.

### Task 12: Integrate cached builds, verify candidate artifacts and promote locally

**Create:** `pipeline/build_maps.sh`, `scripts/verify-maps.mjs`,
`tests/labels/promotion.test.js`, `docs/LAYOUT_VALIDATION.md`.
**Modify:** `pipeline/run_all.sh`, `README.md`, `docs/PROCESS.md`, `docs/DESIGN.md`,
`docs/AUTOMATION.md`, `docs/ADAPTING.md`, `HANDOFF.md`, and finally the two existing `output/` HTML files.

1. Add a promotion test using temporary files: fail a candidate's audit and assert destination
   hashes are unchanged; pass both candidates and assert the promoted hashes equal the audited
   hashes. Check missing-cache diagnostics and failure cleanup. Run
   `node --test tests/labels/promotion.test.js`; expect missing promotion behavior.
2. Implement cached rebuild without fetches and a separate verification/promotion command.
   `run_all.sh` remains the explicit full-fetch path and invokes bundling/finalization at the
   right points. Verification validates both candidates before replacement, stages temporary
   sibling files and uses rollback if the second replacement fails; two file renames alone
   do not make the pair atomic. Never overwrite the source snapshots used for baseline evidence
   before final checks. Reports retain the original artifact hashes.
3. Regenerate actual intermediates once if absent using `cd pipeline && ./run_all.sh`; record
   resulting data hashes because external data may have changed since the original sheet.
   Thereafter use `./pipeline/build_maps.sh`. Run final static audits, browser matrix, coverage
   and the real-map Task 11 benchmark. Explain data-driven visual differences separately from
   layout differences; do not silently adjust coordinates to match an old screenshot.
4. Run the verification commands below. Expected: all tests and hard audits pass; coverage and
   recorded performance profile meet their gates; zero unknown annotations; static works without
   layout JS/network. Then use `--promote` to update local `output/` files. Reopen those exact
   bytes and verify their hashes. Update build/audit commands, coverage policy, remaining region
   limits and real touch-test status in the listed docs and handoff.
5. Use `superpowers:verification-before-completion`, inspect `git diff --check` and the final
   artifact/report hashes, then commit: `feat: deliver automatically validated trail map layouts`.

```bash
npm ci
npm run build:labels
python3 -m unittest discover -s tests/python
npm run test:unit
npm run test:browser
npm run verify:maps -- --static pipeline/grand_canyon_trails.html --interactive pipeline/grand_canyon_trails_interactive.html --report artifacts/layout/release
npm run verify:maps -- --static pipeline/grand_canyon_trails.html --interactive pipeline/grand_canyon_trails_interactive.html --report artifacts/layout/release --promote
git diff --check
```

`npm ci` is setup, not necessary on every edit. The final promotion command may reuse reports
only when all artifact, policy, font, browser-profile and test-version hashes match; otherwise
it reruns verification. Tests must reject a candidate modified between audit and promotion.

## Review checkpoints and completion record

| Checkpoint | Reviewable result |
|---|---|
| After Tasks 1–2 | Reproducible legacy findings and complete annotation inventory |
| After Tasks 3–6 | Solver fixtures, measured glyph bounds and coverage diffs for dense scenes |
| After Tasks 7–9 | Working explorer transitions and static output without layout JS |
| After Tasks 10–12 | Full reports, performance profile, validated local artifacts and updated docs |

At completion, report actual artifacts changed, measured coverage/latency, browsers tested,
remaining semantic/data limitations and any real-device checks still outstanding. Do not
claim general automatic region placement, arbitrary print-size correctness or field-verified
geographic data. Do not claim success if a required release check remains unmet.

The initial audit is a useful first deliverable, but the authorized implementation scope
(if this plan is executed) runs through validated outputs; an audit or point-only placement
milestone is not completion of the full design.
