# Initial camera responsiveness investigation

Status: investigation in progress, 2026-09-09. This is task 13 of the
[portable cartography plan](plans/2026-09-09-portable-cartography.md), separate
from its content and readability work. No 3× startup improvement has been
established by this investigation yet.

## Correct the measurement first

The old startup script waited for an SVG `viewBox` change. That does not establish
that the persistent Canvas/WebGL camera has drawn the requested view. The old
renderer comparison also accepted `renderer.active` as evidence of a completed
frame, and forced the baseline to SVG while comparing it with other backends.
Those timings cannot establish a matching-backend startup speedup.

Both scripts now share `scripts/startup-probe.mjs`. It requires a camera revision
newer than the pre-input revision and a completed draw whose view and revision
match the controller. Current renderers expose `paintedView` and `paintedRevision`.
For older immutable files, benchmark-only instrumentation wraps `draw`, records
its actual view/revision, and publishes that record only after the original
synchronous call successfully returns while active. Pending Canvas initialization
cannot accidentally pass the SVG branch. SVG runs require the exact current
`viewBox`. The following animation frame supplies the presentation timestamp.

This is a completed-draw plus next-rAF **presentation proxy**, not measurement of
GPU completion or display scanout. Early input is a synthetic `WheelEvent` queued
25, 100 or 250 ms after DOMContentLoaded; it measures application event handling,
not the operating system input queue. It does not exercise input during HTML
parsing, so navigation timing is reported independently rather than hidden in
this input metric. The renderer script also retains trusted Playwright wheel and
drag phases after initialization.

Every input HTML is read once before launching the browser, with SHA-256 recorded.
The startup script uses at least three repetitions and interleaves baseline and
candidate at each offset, reversing their order on alternating repetitions. Each
page has a fresh context at 1440 × 1000 CSS pixels, device scale factor 1. An
explicit backend selection applies equally to every file; `native` preserves each
file's declared default. Backend comparisons separately record requested and
actual backend, including fallback.

The initial-layout promise, first correct camera frame, and eventual settled-label
time are separate fields. Advancing a readiness flag cannot satisfy the camera
probe. Regression tests cover stale views, stale revisions, activation without
paint, draw failure, pending initialization, SVG matching, and run ordering.

## Frozen baseline

The baseline is the main repository candidate available before this cartography
work, copied into the ignored investigation directory without modifying its bytes:

- File: `artifacts/startup/task13/baseline-main.html`
- SHA-256: `81e4df40f3827c7a6ebc92a96aa61e68c473a80efe788b5bc78718283e2cd035`
- Size: 43,046,264 bytes.
- Source: `/Users/ollie/Documents/grand-canyon-trail-maps/pipeline/grand_canyon_trails_interactive.html`.

Copying a measurement baseline does not promote it into `output/`.

Nine Chromium Canvas runs, three at each input offset, produced the following
medians. These are baseline observations, not improvement claims:

| Input after DOMContentLoaded | Due input → correct Canvas frame | Timer queue delay | Navigation → initial layout ready | Navigation → settled labels |
|---|---:|---:|---:|---:|
| 25 ms | 766 ms | 10 ms | 1,014 ms | 1,364 ms |
| 100 ms | 986 ms | 24 ms | 1,351 ms | 1,678 ms |
| 250 ms | 823 ms | 14 ms | 1,287 ms | 1,618 ms |

Evidence: `artifacts/startup/task13/baseline-canvas/chromium-measure.json` and
`inputs.json`. Exact engine version and host hardware are recorded in each row.
An earlier dry run that accepted an SVG frame during pending Canvas initialization
is explicitly retained under `rejected-pending-renderer-probe`; **do not use it as
performance evidence**.

Most elapsed time occurs after dispatch, while the renderer and initial placement
prepare, rather than waiting for the input timer to run. This distinguishes the
startup bottleneck from the already smooth persistent camera.

## Critical-path evidence

A separate nine-run Chromium CPU profile set is stored in
`artifacts/startup/task13/profile-canvas`. Profiling changes execution costs, so its
latencies are not mixed with the unprofiled measurements above. Sample locations
were mapped back to the frozen embedded script, including minified functions.
Median sampled self time across those profiles was approximately:

| Work | Sampled self CPU time |
|---|---:|
| `contourRuns`: string splitting and numeric array conversion | 201 ms |
| Regular expressions, principally contour syntax/splitting | 71 ms |
| Per-contour bounds and original `Path2D` construction | 43 ms |
| `contourChunks` | 3 ms |
| Garbage collection, all causes | 42 ms |

These rows are sampled CPU attribution, not independently additive wall-time
savings. Browser-native work and idle time remain separate; they cannot safely be
assigned to image decode or HTML parsing solely from this CPU profile.

The frozen file has 1,583 paths containing 37,949,531 bytes of path data (88% of
file size), about 1.78 MB of embedded image strings and 2.26 MB of font strings.
Contour path data alone is distributed as follows:

| Tier | Paths | Path-string bytes |
|---|---:|---:|
| Overview | 68 | 7,324,299 |
| Fine | 218 | 14,664,126 |
| Finest | 205 | 14,641,907 |

The fine and finest tiers contain 80% of contour path bytes but are not visible
at the initial overview. `CanvasMapRenderer.prepare()` nevertheless awaits
`preview.ready`, which constructs numeric runs, bounds, chunks and original paths
for every tier. WebGL subsequently prepares its buffers from that same collection.
Merely selecting WebGL does not remove this shared initialization dependency.

## Recommended isolated prototypes

1. **Prepare the required contour tier first.** Activate the persistent renderer
   with complete geometry for the initial view, then prepare hidden tiers in
   bounded idle work. A zoom that needs a pending tier must prioritize it, retain
   usable coarse geometry while preparing, and finish with the correct contour
   interval. Preserve deterministic feature identity and all eventual content.
   This is the strongest 3× candidate because it removes preparation of 80% of
   currently hidden contour data from the initial dependency chain. A 3× ratio
   remains a hypothesis until the corrected interleaved benchmark and correctness
   checks pass; it is not a promise derived from byte counts.
2. **Precompute contour arrays, bounds and chunk metadata.** Embedded typed data
   could avoid repeated runtime text parsing and reduce allocations. The profile
   justifies testing it, but removing roughly 300 ms of sampled work alone does
   not demonstrate a 3× reduction from an 800–1,000 ms response. Retaining both
   full SVG paths and duplicate numeric data could make navigation worse.
3. **Create dense measurement SVG only when needed.** This can reduce the large
   inline path parse/layout surface while preserving authored static output.
   It is a larger artifact/interface change and should follow the tier prototype,
   with exact geometry, source identity, text-path measurement, fallback and
   standalone loading regression coverage. Current data does not quantify its
   isolated gain.

Do not adopt another camera rewrite on this evidence. Preserve current smooth
pan/zoom behavior and allow labels to complete progressively, as the user requested.

## Reproduction

```sh
node --test tests/labels/startup-probe.test.js
PLAYWRIGHT_BROWSERS_PATH=.browser-cache \
  STARTUP_REPORT_DIR=artifacts/startup/comparison-canvas \
  node scripts/benchmark-startup.mjs chromium BASELINE.html CANDIDATE.html --backend=canvas
PLAYWRIGHT_BROWSERS_PATH=.browser-cache \
  STARTUP_REPORT_DIR=artifacts/startup/comparison-webgl \
  node scripts/benchmark-startup.mjs chromium BASELINE.html CANDIDATE.html --backend=webgl
PLAYWRIGHT_BROWSERS_PATH=.browser-cache \
  STARTUP_PROFILE=1 STARTUP_REPORT_DIR=artifacts/startup/profile \
  node scripts/benchmark-startup.mjs chromium BASELINE.html --backend=canvas
PLAYWRIGHT_BROWSERS_PATH=.browser-cache \
  node scripts/benchmark-renderers.mjs chromium BASELINE.html CANDIDATE.html 3
```

Pending evidence: isolated parse/font/image trace, frozen final cartography
candidate comparisons, prototype correctness and speedup, and Firefox/WebKit
startup measurements. These baseline results do not authorize declaring task 13's
3× implementation objective delivered.
