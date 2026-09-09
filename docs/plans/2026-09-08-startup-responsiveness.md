# Startup responsiveness implementation plan

**Status:** Implemented and integrated into the main candidate. The first timing pass met 3× at all sampled offsets; a repeat exposed an intermittent Firefox miss, documented below. The 3× target is not consistently met across the tested startup timings. The user requires at least 3× better initial responsiveness after load, measured against the latest contour-optimized candidate. Pan throughput is not the target. Delivered output and hosted publication are outside this change.

**Goal:** Reduce latency from an early queued zoom input to its first displayed camera update by at least threefold, without dropping the final label search or geographic detail.

**Architecture:** Run the initial numerical placement in a bundled worker, preserving main-thread SVG measurement and validated commits. Process contour initialization in bounded batches and reuse existing embedded raster relief images instead of encoding another preview. Initial input updates the camera while optional label placement is pending; results computed for superseded camera, layer, or viewport state are discarded and recomputed. Static finalization and subsequent settled transactions retain their existing semantics.

**Tech stack:** Existing JavaScript solver, SVG/Canvas, embedded Blob worker, esbuild, Node tests, Playwright.

1. Establish early-input timing at several offsets after DOMContentLoaded on immutable candidate bytes. Record input/camera latency, readiness, longest blocking task, artifact hash, browser and label outcomes. Do not count merely displaying a loading message as responsiveness.
2. Add a failing worker-equivalence test for real candidate fallback enumeration and trail collision checks. Extract serializable fallback inputs, bundle the worker into the standalone runtime, and verify identical placement results.
3. Add a failing browser lifecycle test showing input changes the camera while initial placement is pending and stale results cannot commit. Integrate initial worker placement and consistent ready/whenSettled promises. A worker failure must not silently leave labels missing.
4. Add failing tests for deferred contour initialization and native-image relief reuse. Preserve exact contour coordinates, styles, source restoration and buffer accounting. Yield only with detail-group styles restored.
5. Run focused Node and Chromium/Firefox/WebKit lifecycle, frame-validity and stroke tests. Compare baseline and modified HTML under the same early-input timing workload. Inspect outcomes and run independent audit on representative settled states. Report any missing 3× target rather than redefining the metric.
6. Update the owning controller/preview contract, integrate only this task's changes with the root checkout after checking concurrent edits, and leave output promotion to the full release gate.

No delivered files are promoted by this plan. The baseline includes commit c8bdf31 from the parallel performance session.

## Measured result

The initial-input target passed at all nine sampled browser/offset combinations.
Values below are milliseconds from the intended input time to the animation frame
after the first changed camera viewBox. Each browser used fresh page contexts,
1440×1000 CSS pixels, DPR 1, headless execution on Apple M3, and immutable HTML
served locally. Inputs were scheduled 25, 100 and 250 ms after DOMContentLoaded,
in that order within each cell. These are nine individual trials, not percentile
estimates or a guarantee for other hardware. Chromium used software rendering.

| Browser | Before (ms) | After (ms) | Paired improvement |
|---|---|---|---|
| Chromium 140.0.7339.186 | 941 / 850 / 669 | 94 / 58 / 33 | 10.0× / 14.6× / 20.5× |
| Firefox 141.0 | 1396 / 1939 / 1760 | 161 / 84 / 92 | 8.7× / 23.1× / 19.1× |
| WebKit 26.0 | 1522 / 1375 / 1237 | 269 / 275 / 111 | 5.7× / 5.0× / 11.1× |

This measures queued-input responsiveness, including main-thread scheduling
delay. It approximates presentation using animation frames; it does not measure
physical display latency, downloading, or every possible interaction offset.
End-of-initialization observations improved only 1.25–1.83×: Chromium
1608–1758 → 960–1281 ms, Firefox 3423–4309 → 2636–2954 ms, and WebKit
2388–2575 → 1676–1718 ms. Labels remain hidden during the initial worker pass
while the camera responds, then appear after the current placement is validated.

Baseline SHA-256: `2060fb8c1322f629a5637ece4e0e4d397e038d849e654517d356d2ec2f06c717`.
Candidate SHA-256: `3b27be901fc63f0620ce4359a4cd7667beefe21ecb5cf900b4ce8ecc31b86aaf`.
All HTML outside the runtime script is byte-for-byte identical, including terrain,
contour coordinates, fonts, feature inventory and authored SVG. The existing
time budget for optional line candidates can still cause small placement-count
differences; the numerical worker-equivalence tests use identical prepared inputs.

Raw measurements and audit screenshots are local ignored artifacts under
`artifacts/startup/` in both the main checkout and the startup worktree. The reproducible benchmark is
[benchmark-startup.mjs](../../scripts/benchmark-startup.mjs):

```bash
PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/benchmark-startup.mjs chromium BASELINE.html CANDIDATE.html
# Repeat sequentially for firefox and webkit; do not run competing browser workloads.
```

Verification: 69 Node tests passed; the focused startup, contour preparation,
lifecycle, frame-layout and stroke-width matrix passed 85 tests with 2 existing
skips across all three browsers. Regressions cover input during a held worker,
stale results, preview readiness, required-font removal, blocked workers, fallback
errors and static error status. Independent managed Chromium audit at 1×, 1.27×
and 6× passed with zero overlaps, clipping, unresolved, missing-required or
typography findings. Overview and 6× screenshots were visually inspected.
This is focused validation, not the complete release/promotion gate.

The recommended backend remains the existing SVG/Canvas hybrid. A wholesale
Canvas or WebGL rewrite is not needed for the measured startup target: the
implemented gains come from scheduling the existing work and avoiding duplicate
raster preparation, while retaining the current detail and final SVG rendering.

Initial integration verification: the main interactive generator was rebuilt from
local caches and produced exactly the measured/audited candidate hash above, before
the subsequent contour-label fix described below. Direct
`file://` smoke checks in Chromium, Firefox and WebKit confirmed working embedded
workers, accepted early camera input, successful initial labels, worker termination
and no page errors. The shared runtime retains the static synchronous branch;
static regression tests passed, but static deliverables were not regenerated or
promoted. The updated interactive candidate is
`pipeline/grand_canyon_trails_interactive.html`.


## Contour labels during dragging

A user-reported follow-up exposed a missing dependency in the motion preview:
contour elevation text remained visible according to layout state, but its
textPath source was detached along with the contour layer. The browser therefore
stopped drawing the text during panning.

The preview now moves only source paths referenced by visible text into temporary
non-painted SVG definitions, retaining the same nodes and geometry. Settlement,
invalidation and destruction restore their original positions. Shared references
use one path, and contour geometry is not duplicated. The independent reviewer
found no remaining issue in this change.

The new regression failed before the fix and passed in all three browsers. The
focused motion, stroke and startup matrix passed 79 tests with 2 existing skips.
A real-map diagnostic with an enlarged optional candidate budget confirmed that
all five contour labels placed in the tested 2× view remained connected and drawn
after panning. The sampled 6× and 14× center views had no placed contour labels,
so those views do not establish label-retention coverage. Startup timing is
rechecked below against the same contour-optimized baseline.

Final candidate SHA-256: `e9740dd23130abc5f9e8701c9ba28121e47a2595cdd1263c6849c4ebd23fc4f0`.

| Repeat after contour-label fix | Before (ms) | After (ms) | Paired improvement |
|---|---|---|---|
| chromium | 709 / 826 / 678 | 126 / 75 / 40 | 5.6× / 11.1× / 16.9× |
| firefox | 2019 / 1959 / 1808 | 158 / 86 / 1112 | 12.8× / 22.8× / 1.6× |
| webkit | 1369 / 1380 / 1219 | 275 / 253 / 135 | 5.0× / 5.5× / 9.0× |

The Firefox 250 ms trial responded in 1112 ms, only 1.6× better than its paired
baseline. Instrumented repetitions reproduced roughly 1.17 s and localized most
of the delay before input dispatch, while initial placement was still pending.
The instrumented font loads, individual contour preparation iterations and SVG
measurement calls did not explain the long pause. Rendering/scheduling remains a
hypothesis, not an established cause. Automatically showing the prepared startup
preview did not improve it in an isolated prototype and was not adopted.

The first pass therefore overestimated consistency: these results do not support
an unconditional 3× startup claim for Firefox. Chromium and WebKit retained more
than 3× improvement at each tested offset. Raw final results are in
`artifacts/startup/*-measure.json`; the earlier results are preserved under
`artifacts/startup/pre-contour-fix/` and in the original startup worktree. The
contour-label fix and startup improvements can be integrated independently of
resolving this remaining Firefox timing limitation.
