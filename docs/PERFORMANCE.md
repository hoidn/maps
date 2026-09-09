# How the interactive map became more responsive

Written 2026-09-09; records the performance work through commit `d9780ae`.
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
the worker's responsiveness benefit. The worker is terminated after startup.
Subsequent settled passes and static finalization remain synchronous.

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

These are source-based opportunities, not implemented changes or measured speedup
claims. Prioritize a small before/after experiment for each:

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
