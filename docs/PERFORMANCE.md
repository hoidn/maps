# How the interactive map became more responsive

Written 2026-09-09; records startup work through commit `d9780ae` and the
subsequent pan stability and gesture-scheduling work described at the end.
The main gains came from moving initial label computation off the UI thread,
avoiding duplicate image preparation, and drawing less contour geometry during
gestures. The map still uses authored SVG with a Canvas contour preview and is
delivered as one standalone HTML file.

Initial camera response improved substantially, but full initialization improved
less. Repeated measurements also found a Firefox startup pause that prevents a
consistent 3× claim. The results and limits below are part of the explanation.
This is an implementation record; the [layout contract](specs/map-layout.md)
owns the maintained interfaces and [layout operations](LAYOUT_VALIDATION.md)
owns release requirements.

## What was slow

The original investigation separated three costs that can all feel like “SVG is
slow”:

1. **Loading and preparing geometry.** The investigated candidate contained about
   43 MB of HTML, including 36.6 MB of contour path text and 2.27 million contour
   coordinates. It had only 491 contour path elements: long paths, rather than
   the number of DOM elements, dominated this payload. Earlier geometry changes
   deliberately retained more detail, so reducing it was not a free optimization.
2. **Finding label placements.** Initial layout transactions took roughly
   440–726 ms in the first diagnostic pass, with 374–651 ms spent in the solver.
   Dense fallback searches were much larger than the normal candidate counter
   suggested. While this computation ran synchronously, input could wait behind it.
3. **Preparing and drawing gesture previews.** Startup parsed contours eagerly
   and cloned the full SVG to generate another relief bitmap. During gestures,
   rejecting an entire offscreen path was too coarse: a long contour crossing
   the viewport still caused substantial offscreen geometry to be submitted.

These are observations from the earlier investigation, not timings of the final
implementation. Local diagnostic files remain in the ignored
`artifacts/performance-investigation/` directory. The startup comparisons below
use a newer baseline that already includes the parallel contour optimizations.

## The changes and why they help

### Run the initial label solve in a worker

SVG text measurement still happens on the main thread because it depends on
loaded fonts and browser geometry. The controller then sends plain candidate,
obstacle, trail and camera data to an embedded worker. The worker runs the same
numerical placement solver, including the same dense fallback enumeration and
trail collision queries.

The browser can process camera input while that initial search continues.
Annotations remain hidden until a valid placement is available. Before applying
the result, the controller checks that camera, layers, viewport, controls and
font identities/status still match the measured state. A stale result is
discarded and recomputed, preventing labels from appearing in an outdated view.

This primarily reduces **time spent blocking input**, rather than eliminating
the solver's computational work. There is no claimed isolated multiplier for the
worker alone: the reported startup timings measure the combined changes.

The worker source is bundled into the HTML and started through a Blob URL, so no
additional hosted asset is required. Worker construction or execution failure
falls back to the same solver on the main thread; that preserves labels but loses
the worker's responsiveness benefit. In that startup-only version, the worker was terminated after startup and
subsequent settled passes remained synchronous. The integration described below
keeps the worker for later interactive solves; static placement stays synchronous.

Implementation: [controller](../pipeline/labels/runtime.js),
[worker client](../pipeline/labels/initial-placement-client.js),
[serializable solve](../pipeline/labels/initial-placement.js),
[fallback enumeration](../pipeline/labels/point-fallback.js), and
[bundle build](../scripts/build-labels.mjs).

### Let contour preparation yield to input

The preview now prepares paths in batches with an approximately 8 ms time budget,
yielding through a timer between paths. This gives input and rendering a chance
to run while the remaining contours are prepared. The budget is cooperative,
not a hard maximum: one path can take longer before the next yield.

Bounds for generated polylines come directly from their coordinates. Hidden
detail groups no longer need to remain temporarily visible while preparation
yields. Unsupported path syntax retains its SVG bounds/Path2D fallback, with
temporary visibility restored before yielding.

Startup waits for the current preview preparation promise before committing its
initial placement. This matters when theme or layer changes replace the pending
preview. Input remains accepted during that wait.

Implementation: [contour preparation](../pipeline/labels/contour-preview.js) and
the initial transaction in the [controller](../pipeline/labels/runtime.js).

### Reuse the terrain images already in the page

The relief was already embedded as raster images, but preview construction
cloned the SVG, decoded a serialized copy, drew it into a canvas and encoded a
new image. The interactive map now keeps those original embedded images live
and skips that conversion. It therefore avoids both the full-SVG clone and
redundant image preparation for the normal terrain case.

Other kinds of background content still use the bounded bitmap fallback. This
change does not shrink the original HTML or remove its download/decode costs.

Implementation: [motion preview](../pipeline/labels/motion-preview.js).

### Draw visible contour sections and reuse pan pixels

The parallel work in `c8bdf31` divides generated polylines into short sections
with bounds. The Canvas preview excludes offscreen sections and merges adjacent
visible ranges before stroking. That avoids drawing shared portions twice and
preserves joins and opacity. It retains every original coordinate; unsupported
syntax and stroke cases requiring the full path keep their fallback.

At a fixed zoom, a 64 CSS-pixel margin around the viewport lets a small pan reuse
the existing contour pixels. Crossing that margin triggers a redraw. Zoom frames
omit the extra margin; theme, layer, scale and pixel-density changes invalidate
reuse. This trades additional cached geometry and pixels for less repeated
drawing. The numeric coordinate cache alone is about 35 MiB for this map.

Earlier work in `bb5e567` also cached trail projections per camera and nearby
collision-query neighborhoods. Repeated dense label candidates can reuse those
queries, while candidates outside a cached neighborhood fall back to the full
source index. These changes were already present in the startup baseline and
must not be counted again as startup-worker gains.

Implementation: [contour sections](../pipeline/labels/contour-geometry.js),
[preview drawing](../pipeline/labels/contour-preview.js), and
[trail queries](../pipeline/labels/trail-query.js). The separate
[gesture performance record](plans/2026-09-08-contour-gesture-performance.md)
contains warm-pan measurements and their substantial run-to-run variation.

### Preserve elevation text while switching to the preview

A follow-up exposed a correctness problem: detaching contour paths also removed
the geometry referenced by visible elevation textPath labels. The labels were
still marked visible, but the browser could no longer draw them.

During motion, the preview now moves only the paths referenced by visible text
into temporary, non-painted SVG definitions. It retains the original nodes and
restores their original positions afterward. Shared references use one path;
there are no duplicate path IDs or copied geometry strings. This preserves the
labels while keeping the contour drawing optimization.

Regression: [contour labels during panning](../tests/browser/contour-label-motion.spec.js).

## What the speedups mean

The final repeat compared baseline `c8bdf31` against the rebuilt candidate from
`d9780ae`. Each cell lists the observations for input scheduled 25, 100 and
250 ms after DOMContentLoaded, respectively.

| Browser | Before response, ms | After response, ms | Paired improvement |
|---|---|---|---|
| Chromium 140.0.7339.186 | 709 / 826 / 678 | 126 / 75 / 40 | 5.6× / 11.1× / 16.9× |
| Firefox 141.0 | 2019 / 1959 / 1808 | 158 / 86 / 1112 | 12.8× / 22.8× / 1.6× |
| WebKit 26.0 | 1369 / 1380 / 1219 | 275 / 253 / 135 | 5.0× / 5.5× / 9.0× |

The benchmark measures from the **intended input time** to the animation frame
after the camera viewBox changes, so it includes time spent waiting for the
input callback to run. This is a presentation proxy, not physical display
latency. Tests used fresh page contexts, local HTTP, Apple M3, 1440×1000 CSS
pixels, DPR 1 and headless browsers; Chromium used software rendering. These are
individual trials, not percentiles or hardware-independent guarantees.

The first pass showed 5–23× improvement at every sampled timing, but the repeat
above disproved its consistency in Firefox. Instrumented repeats reproduced
approximately 1.17 s at the later input timing, mostly before input dispatch.
Font loads, individual contour preparation iterations and instrumented SVG
measurement calls did not explain the pause. Browser rendering/scheduling is
still a hypothesis. Automatically displaying the prepared preview sooner did
not fix it in an isolated prototype and was not adopted.

Full initialization is a different measure: in the initial paired pass,
end-of-initialization observations improved only 1.25–1.83×. The map responds
while initial labels are still being calculated; it does not finish all startup
work three times faster. Exact hashes, earlier measurements and integration
details are in the [startup implementation record](plans/2026-09-08-startup-responsiveness.md).

## Why retain SVG and Canvas

The current split keeps typography, interactive vectors and final cartography in
SVG while Canvas handles contours during gestures. A complete Canvas or WebGL
rewrite would still need to address label computation and geometry preparation,
and would require replacing or revalidating text rendering, hit testing, styling
and export behavior. No complete alternative backend was benchmarked here, so
there is no supported migration speedup estimate.

The implemented changes preserve the authored SVG, contour detail, embedded
fonts and standalone delivery. The unresolved Firefox pause remains a reason
for further profiling, not evidence that switching backends alone would fix it.

## Remaining small optimization candidates

These are opportunities, not implemented changes or measured end-to-end speedups.
The isolated timing estimates below help prioritize a before/after experiment:

1. **Create full-run Path2D objects only when needed.** Initialization currently
   builds a complete Path2D for every parsed contour run, including hidden detail.
   Drawing partially visible runs already uses separately cached visible ranges.
   Lazily creating the full path when a complete run or a fallback stroke actually
   needs it could remove unused startup work. This is a small change, but the first
   draw requiring that path could become slower; compare both startup and first zoom.
2. **Combine repeated coordinate scans.** Initialization scans each run to compute
   its bounds, then scans its sections again to compute their bounds. The section
   pass could also accumulate the enclosing run bounds. This is a small CPU
   optimization with unchanged geometry; its share of total startup time is not
   yet isolated and may be modest.
3. **Prepare visible contour detail first.** Startup currently prepares all detail
   tiers before preview readiness, even though higher tiers are hidden at the
   overview. Preparing the current zoom's tiers first and the others during idle
   time could reduce initial work further. This requires more lifecycle work than
   the first two: direct high-zoom URL loads and early zooms must still show complete
   geometry, and readiness must distinguish available detail from pending detail.

### Estimated payoff after isolated timing

A 2026-09-09 microbenchmark repeated the existing parsing, bounds, section and
Path2D construction operations over the current map's geometry three times per
browser. It used the same headless Chromium/Firefox/WebKit versions and Apple M3
environment as above. This measures warmed operations after page initialization,
not cold startup or implemented alternative code. The local script and results
are in `artifacts/perf-estimates/measure.mjs` and `results.json`.

The overview contains 454,185 contour points; the hidden 2× and 4.5× tiers contain
1,816,909 more, approximately 80% of the total. Parsing all tiers cost roughly
225–365 ms in these repetitions. Full Path2D construction cost 25–50 ms; the
separate whole-run bounds scan cost only 3–8 ms.

| Proposal | Estimated upfront main-thread work avoided | Rough full-initialization benefit |
|---|---|---|
| Lazy full-run Path2D construction | 20–40 ms, mainly from hidden tiers | Usually small: approximately 0–4% less time |
| Combine bounds scans | At most roughly 3–8 ms before replacement overhead | Less than 1%; low priority |
| Defer hidden detail tiers | Roughly 220–310 ms of parsing and preparation | A 5–20% reduction is plausible when this work delays readiness; it can be much smaller when worker computation or browser painting dominates |

The wall-clock estimates are planning estimates, not measurements. Moving work
off the initial path can improve responsiveness without shortening the parallel
worker's completion time. Deferred work must eventually run and could instead
delay the first detailed zoom. Tier deferral already avoids much of the Path2D
and bounds work in the other proposals, so their estimates must not be added.
The best likely payoff is visible-tier preparation; lazy Path2D construction is
the smaller experiment. Combining bounds scans is unlikely to be noticeable alone.

Moving bounds/section generation into the Python build could also remove browser
work, but it needs an embedded-data format and payload/memory measurements. Moving
later settled solves into the worker requires extending cancellation and stale
result handling beyond startup. Both are larger changes. The Firefox pause is
not yet a diagnosed small fix, and none of these proposals establishes another
3× gain in overall responsiveness.

## Reproduce and validate

Keep immutable baseline and candidate HTML files before running the comparison.
The benchmark hashes their bytes and writes ignored reports under
`artifacts/startup/`. Each run overwrites that browser's report, so save results
before another comparison. Run browsers sequentially without competing workloads:

```bash
PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/benchmark-startup.mjs chromium BASELINE.html CANDIDATE.html
PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/benchmark-startup.mjs firefox BASELINE.html CANDIDATE.html
PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/benchmark-startup.mjs webkit BASELINE.html CANDIDATE.html
```

Validation included 69 Node tests; the initial focused browser matrix passed
85 tests with 2 existing skips. After the contour-label fix, the selected motion,
stroke and startup matrix passed 79 tests with 2 skips. These are overlapping
suites, not additive counts. The final independent managed audit passed at 1×,
1.27× and 6× with no overlap, clipping, unresolved, required-content or typography
findings. A diagnostic with a larger optional candidate budget confirmed all
five placed elevation labels survived a pan in the sampled 2× view.

These checks establish the tested behavior, not every view or device. No files
in `output/` were promoted, and hosted publication was not part of this work.

## Pan stability and gesture stalls, 2026-09-09

The subsequent pan work preserves the selected label offset, line position and
text wrapping at the current zoom. Panning can hide labels behind controls or
outside the frame and restore them unchanged. Newly visible labels use unoccupied
positions at settlement; hidden cached labels still reserve their footprints and
same-feature repeat spacing. Zoom, viewport size, fonts and layer changes allow a
fresh layout. The [controller contract](specs/map-layout.md#interactive-controller)
owns this behavior.

Pure pan frames reuse measured footprints and established trail clearance. DOM
updates are skipped when the chosen transform is unchanged, and retained parent
matrices are read after the write batch. Recoverable contour labels retain their
original textPath source even while temporarily hidden. These changes improve
stability and reduce repeated work, but did **not** demonstrate a consistent 3×
continuous-pan frame-rate improvement. Initial paired camera-only measurements
were noisy and included regressions, especially in Firefox. They are not evidence
for a 3× drawing-speed claim.

### Why dragging by hand was worse than the continuous benchmark

The controller previously inferred gesture completion from two quiet animation
frames. It had no knowledge of a held pointer. A slow drag with 50 ms between
moves could repeatedly restore the full SVG and perform synchronous settled label
layout while the mouse button was still held. The continuous camera benchmark,
which submits a view every animation frame, never exercised this gap.

A trusted-pointer diagnostic reproduced ten such settled passes during twelve
small moves in Chromium. Most fast transactions took 5–8 ms, but the unnecessary
full passes took 48–68 ms each. SVG-to-Canvas switching itself took approximately
1 ms in that trace; the synchronous layout and browser geometry work were more
expensive. A separate early zoom trace included a 181 ms pending settled pass,
showing how newly arriving input can wait behind work already on the main thread.
That trace does not establish a universal first-zoom delay.

The controller now tracks pointer lifetime, including cancellation, lost capture
and window blur. A held pointer prevents scheduled full passes. Wheel bursts have
a 120 ms quiet window before the existing two-frame settling check. Fast camera
updates still run on the next animation frame. The final full pass remains
synchronous and can still delay a new gesture that arrives after it has started.

### Isolated gesture-scheduling comparison

Both files in this comparison already contain the pan placement cache and the
parallel contour raster alignment change (`bd54f25`). Only gesture scheduling
changes between them. At 1440 × 1000 and zoom 2, the harness sends twelve trusted
pointer moves, three CSS pixels each, separated by 50 ms. These are single paired
runs, not population statistics.

| Engine | Full passes while held, before → after | Total renderer time while held | Reduction | Longest held render, before → after |
|---|---:|---:|---:|---:|
| Chromium | 10 → 0 | 638 → 78 ms | 8.1× | 67 → 22 ms |
| Firefox | 6 → 0 | 717 → 84 ms | 8.5× | 122 → 43 ms |
| WebKit | 6 → 0 | 800 → 159 ms | 5.0× | 107 → 49 ms |

This exceeds 3× for **time spent inside the renderer during this slow-drag
workload**, by eliminating unnecessary passes. It does not mean 3× frame rate,
3× less end-to-end input latency, or 3× faster initial zoom. The first warm wheel
fast transaction was essentially unchanged: Chromium 21 → 20 ms, Firefox
30 → 31 ms, WebKit 44 → 42 ms. Canvas redraws at a new scale, SVG geometry reads,
remaining live SVG painting and synchronous final layout still need work before
making those broader claims.

Reproduce from the repository root after building the runtime:

```bash
PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/benchmark-gestures.mjs chromium BEFORE.html AFTER.html
PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/benchmark-pan.mjs chromium BEFORE.html AFTER.html
```

Repeat for Firefox and WebKit sequentially, with other browser workloads idle.
The first harness exercises trusted wheel/pointer input; the second isolates
continuous camera updates and reports frame intervals. Both write raw samples,
browser versions and HTML SHA-256 hashes under ignored `artifacts/pan-layout/`.
The original isolated gesture results were retained as `*-gestures-forward.json`.

A second pass ran the candidate first and reproduced zero held-pointer full
passes in all engines. Total held renderer time improved 691 → 77 ms in Chromium
(8.9×), 761 → 89 ms in Firefox (8.6×), and 913 → 187 ms in WebKit (4.9×).
The longest individual held render improved about 2.4–2.9× in this repeat;
there is still no consistent 3× claim for that latency metric. The repeated
first-wheel timings also remained similar. These raw results are in
`*-gestures.json`; each file records the tested HTML hashes.

Validation for this worktree candidate: 71 Node tests passed; 133 focused browser
tests passed across Chromium, Firefox and WebKit, with two existing skips.
Independent Chromium audits passed at zoom 1, 1.27 and 6 with no overlaps,
clipping, unresolved ownership, missing required content or typography findings.
A separate rendered-geometry check of held-pan frames and settlement at zoom 2,
6 and 14 found no geometry violations or changes to original label transforms
and wrapping. These are sampled checks, not the complete release gate.
Audited candidate SHA-256:
`e38754423ff36958a9e5bb625d25eae8acfd9ee5c37dfab5595597164bed4687`.

### Integration with asynchronous settling

The later integration combines this work with the parallel session's persistent
placement worker, cancellable jobs and cooperative fallback. New input cancels
obsolete interactive settling; DOM measurement yields between batches and uses
hidden clones so accepted visible labels need not disappear during preparation.
The numerical solver remains synchronous inside the worker and for static maps.
The no-worker path uses the same solver with cooperative, cancellable slices.

Integration regression cases caught and corrected stale inverse font scaling
after resize, clone/original typography mismatch after zoom, stale wrapping when
an ordinary candidate wins, and control changes during preparation. The camera
and control snapshot now precedes the first preparation yield. Rejected current
jobs also invalidate potentially inconsistent measurements: moving the map by
30 CSS pixels during a yield previously left retry footprints 30 pixels away
from painted text. Cancelled older jobs cannot clear a newer job's caches.

Pointer and wheel tracking lives in the controller. The builder retains pointer
cancellation/lost-capture/blur cleanup for its own drag state. The merged path
also reuses camera and parent-transform math during translation and batches DOM
writes before geometry reads. These integrations have their own validation;
the 5–9× slow-drag measurements above describe the scheduling-only candidate,
not a fresh performance claim for the combined implementation.

A static-finalizer workflow check reported one Firefox/light overlap. The same
check failed identically on the pre-integration `8735b1a` branch, so it remains a
known static-export limitation, not evidence of a new integration regression.
No `output/` deliverable is promoted by this merge.


Combined implementation validation: 72 Node tests and 157 focused browser tests
passed across Chromium, Firefox and WebKit (two existing skips). Independent
Chromium map audits passed at zoom 1, 1.27 and 6; held-pan and settled-frame
geometry checks passed at zoom 2, 6 and 14. These sampled checks do not replace
the complete release gate. The rebuilt integrated candidate SHA-256 is
`257d5da3c7cb22003a58c3c9a52a987259f4a6873f2cc6b880842c7455c8c28b`.
Reports remain under ignored `artifacts/integration/` in the integration worktree.
