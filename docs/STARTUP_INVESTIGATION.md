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

Nine headless Chromium 140.0.7339.186 Canvas runs on an Apple M3 (macOS arm64,
Node 24.6.0), three at each input offset, produced the following
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

A separate detailed timeline (`chromium-timeline.json`, with promise-stage
observations in `stages.json` under the same task directory) recorded about
199 ms of HTML parsing, 104 ms of layout and 52 ms of style updates through the
first correct Canvas frame. Required font-face loads spanned roughly 69 ms;
individual faces overlap, so their durations must not be added. The two image
decode promises in scene preparation waited about 1 and 18 ms. Native image
decode events across threads totaled about 70 ms. These profiled events overlap
other work and do not form an additive wall-time budget. This evidence does not
identify font or image decode as the main startup obstacle.

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

## Contour-tier ablation: useful, insufficient alone

A diagnostic HTML copy removed the fine and finest contour groups (29.32 MB of
markup), retaining the rest of the frozen baseline unchanged. It deliberately
lacks content, so it is **not a deliverable or proof of a correct optimization**.
It estimates headroom for preparing hidden tiers later. Three interleaved runs
per input phase produced:

| Input offset | Baseline median | Overview-only ablation median | Ratio |
|---|---:|---:|---:|
| 25 ms | 780 ms | 522 ms | 1.49× |
| 100 ms | 1,001 ms | 840 ms | 1.19× |
| 250 ms | 845 ms | 657 ms | 1.29× |

Evidence: `artifacts/startup/task13/ablation-canvas/`, with hashes in `inputs.json`.
This negative result matters: removing 80% of contour bytes did **not** produce
3× initial response. Inspecting the remaining dependency shows why:
`CanvasMapRenderer.activate()` is reached through label `commit()`, after the
initial placement worker completes. While the worker runs, controller status is
`loading`, which blocks `render()` even if geometry has finished preparing.
Input during initial placement can also invalidate its snapshot and require
another layout attempt. Faster geometry preparation alone leaves those waits.

## Combined diagnostic: geometry first, labels later

A second ignored diagnostic copy also activated the unlabeled camera immediately
when renderer geometry became ready and redrew it when the camera revision
changed, independently of the initial label worker. It retained the same
intentional omission of fine contours. An interleaved run observed:

| Input offset | Baseline median | Combined ablation median | Ratio |
|---|---:|---:|---:|
| 25 ms | 1,403 ms | 674 ms | 2.08× |
| 100 ms | 1,885 ms | 639 ms | 2.95× |
| 250 ms | 1,824 ms | 544 ms | 3.35× |

These timings are **exploratory, not acceptance evidence**. A source build was
running during the comparison and the baseline itself became materially slower
than the isolated baseline run. Interleaving helps order bias but cannot remove
unequal competing load. A preceding run overlapped a browser test and was
explicitly discarded. Additionally, both diagnostic copies lack dense contour
content; neither proves an equivalent, correctly progressive implementation.
Evidence is under `artifacts/startup/task13/ablation-early-camera`; rejected runs
are identified separately. No 3× production improvement follows from this table.

The result supports testing the combined dependency change and shows that the
25 ms phase still falls short. Initial synchronous label measurement and required
font loading are remaining dependencies to inspect after the complete-geometry
prototype, rather than promising another factor from unmeasured work.

## Recommended combined prototype

The most realistic next prototype therefore needs both changes:

1. **Prepare the required contour tier first.** Make complete overview geometry
   available before preparing hidden fine/finest tiers. A zoom needing a pending
   tier must prioritize it, preserve useful coarse geometry during preparation,
   then finish with the correct interval. Preserve all eventual content and
   deterministic source identity.
2. **Activate the camera independently of initial label placement.** Once its
   geometry is ready, draw the current camera view and continue responding to
   input while labels prepare. Commit labels progressively when valid results
   arrive. This must produce actual correct Canvas/WebGL frames, not merely
   advance a readiness flag. The user subsequently clarified that the first useful labels must also appear
   promptly; camera independence alone does not satisfy the task.

Precomputed contour arrays, bounds and chunk metadata remain a secondary
prototype: they can avoid repeated parsing and allocations, but roughly 300 ms
of sampled work alone does not establish a 3× reduction from an 800–1,000 ms
response. Keeping both SVG strings and duplicate arrays could worsen navigation.
Creating dense measurement SVG on demand could reduce the 43 MB inline parse
surface; it is a larger artifact/interface change needing geometry, source
identity, text-path, fallback and standalone loading coverage. Its isolated gain
has not been measured.

Do not adopt another steady-camera rewrite on this evidence. Preserve current
smooth pan/zoom behavior and allow labels to complete progressively.

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

## Quiet comparison and subsequent startup implementation (2026-09-09)

The completed comparison is retained in
`artifacts/startup/task13/final-quiet-headed/RESULTS.md`, with raw JSON, hashes,
graphics metadata and a documented gesture instrumentation limitation. It used
three interleaved repetitions per backend/input phase, headed Chromium on Apple
M3 Metal at 1440×1000, DPR 1. Baseline SHA
`81e4df40f3827c7a6ebc92a96aa61e68c473a80efe788b5bc78718283e2cd035`
and candidate SHA
`a52064dcad978fe1184baa17fa9baccda3db0f4ae50b28281f917c47c4f06473`
were immutable throughout. The candidate grew from 323 to 3,163 features,
934 to 3,690 annotations, and 43.05 to 52.96 MB; it is not an equal-content
renderer microbenchmark.

| Backend | Input after DOMContentLoaded | Main response median | Cartography response median |
| --- | ---: | ---: | ---: |
| Canvas | 25 ms | 1,032 ms | 2,784 ms |
| Canvas | 100 ms | 965 ms | 4,222 ms |
| Canvas | 250 ms | 806 ms | 4,052 ms |
| WebGL | 25 ms | 1,356 ms | 2,897 ms |
| WebGL | 100 ms | 1,515 ms | 5,147 ms |
| WebGL | 250 ms | 1,479 ms | 5,628 ms |

These measured regressions did not meet the 3× target. Warm gesture frames
remained mostly near the 60 Hz display cadence. Canvas zoom transaction p95
increased from 9.0 to 12.2 ms; WebGL increased from 3.3 to 4.9 ms. Trusted
wheel/pan correctness checks passed; the slow-drag derived flag was affected by
pointermove/compatibility-mousemove ordering in instrumentation. Raw paired draws
support 12 correct camera updates per row, but the terminal input lacks a
subsequent independent presentation observation, so that scenario is explicitly
noncomparable for presentation correctness. The original flags are retained.

Subsequent production changes make startup label preparation cooperative from
its first pass, prepare the base scene and contours concurrently, and paint the
complete current base camera as soon as renderer preparation finishes. A delayed
label worker no longer holds the base camera. Pending scene preparation keeps
its SVG source children attached, avoiding mutation across image-decoding awaits.
Obsolete camera/font snapshots cancel both initial measurements and worker work;
blocked workers retain the cooperative numerical fallback.

The first candidate pass now chooses up to eight distinct eligible important
names, primary point names first, plus their associated markers. It applies its
24 ms soft budget before cloning the remaining uncached points and continues
through 8 ms cooperative slices while preparing the minimum seed. It does not
relax collision checks or force names into infeasible positions. Idle preparation
still visits the complete eligible inventory. Diagnostic `initialLabelBatch` and
`firstUsefulLabels` milestones report actual named-feature and symbol counts,
separately from initial readiness and eventual completion.

A subsequent nine-load Canvas diagnostic used the same old cartography data
with the current bundle substituted, SHA
`f65bde8a0c03c98b1026a27e1b6caaa27fc88f9e93b24f0c3b03a90cbdaf6e4c`.
It ran headed on the same hardware profile without competing browser/build work.
One tiny five-test Node invocation overlapped early measurement; this diagnostic
is not a final acceptance comparison. The concurrently developed text-importance
and source-decluttering data were absent from this input.

| Input phase | Correct camera response median | First useful label paint from navigation | Eventual label completion |
| --- | ---: | ---: | ---: |
| 25 ms | 931.8 ms | 1,504.0 ms | 6,270.9 ms |
| 100 ms | 917.1 ms | 1,500.8 ms | 6,336.1 ms |
| 250 ms | 779.0 ms | 1,540.5 ms | 6,289.9 ms |

All nine runs painted eight distinct primary names and nine symbols in the
first batch, then reached 302 placements at the sampled final view without
errors or backend fallback. This improves the preceding cartography startup,
but only returns camera response near original main: **3× remains unmet**.
The earlier cooperative implementation still normalized all eligible points
before its first candidate deadline and took roughly 3.5–3.8 seconds to first
labels; avoiding that work before the bounded seed is the principal subsequent
label-latency change. These separately timed runs do not establish an isolated
speedup for each individual code change.

Focused evidence: 36 startup browser cases passed across Chromium, Firefox and
WebKit, followed by three statistics checks; five batch-selection, renderer-order
and text-eligibility unit tests passed. Regressions cover actual base pixels,
current camera revision, delayed labels, initial cancellation/font changes,
blocked workers, source preservation during image decoding, eight actual painted
names despite an expired soft budget, no secondary premeasurement, and eventual
nondeferred inventory. These do not replace the final release gate.

Pending: rebuild with new cartographic text tiers, independently inspect first
useful labels, repeat immutable quiet comparisons, and finish full release
validation. Preparing only currently required contour tiers remains the most
concrete next path toward the original 3× response target; it requires correct
immediate zoom across pending tiers and eventual full geometry, not a readiness
flag change.

## Faster placement algorithms: ranked investigation

The current interactive solver is already a priority-ordered greedy solver with
repair disabled. Switching to greedy or adding another spatial index is therefore
not a new algorithmic gain. The remaining eager work is more promising: in the
nine-load diagnostic above, final preparation took approximately 2.29–2.35 s and
worker solving 2.21–2.29 s, including scheduling/yield time. Commit took 79–96 ms.
The old candidate inventory contained 549 point names, 1,433 declared wraps and
25,261 ordinary candidates. Wraps contain 49,061 glyphs versus 8,819 base-name
glyphs; one 21-word description alone declares 190 wraps. These are diagnostic
work counts, not measurements of the rebuilt importance-filtered map.

| Approach | Expected benefit and cost | Decision |
| --- | --- | --- |
| Select important text before measuring | Removes entire low-value measurement/candidate trees; little runtime complexity. Useful coverage must be checked at each ground scale. | Implemented; new-artifact measurement pending. Symbols and geometry remain independent. |
| Lazy exact wrap escalation | Start with the full unwrapped name and one cheaply ranked balanced wrap; precisely measure further declared wraps only for unresolved names. Avoids combinatorial DOM work. Requires a cancellable second pass that revisits affected lower-priority placements. | Preferred next preparation prototype. Keep complete names and all eventual alternatives. |
| Lazy fallback positions | Enumerate nearby positions in deterministic distance order and stop at the first acceptable position, instead of constructing and sorting every dense grid for every wrap. | Preferred next solver prototype. Compare placement identity and diagnostics with the exhaustive reference. |
| Reuse text metrics across zoom | Could remove repeated DOM measurement when CSS font size and shaping are identical. Current browsers can change advances with fractional transforms, and the map intentionally grows text with zoom. | Cache only an explicitly verified font/shaping/scale signature; broader reuse needs glyph-level parity evidence. |
| Incremental local repair | Reconsider only changed or newly eligible neighborhoods after zoom. Pan already preserves placement, so this primarily helps zoom settling. | Later, after preparation reductions; changing font size and priorities can invalidate distant dependencies. |
| GPU collision/placement | Parallel numeric candidate checks could help very large scenes, but text shaping, exact glyph geometry, deterministic priority conflicts and data transfers remain. | Larger rewrite with uncertain benefit; WebGL painting alone does not eliminate the measured preparation cost. |

No per-approach speedup is established. As an illustrative ceiling calculation,
halving both approximately 2.3 s phases would reduce a 6.3 s completion to about
4.0 s (1.6×), while reducing both to one third gives about 3.3 s (1.9×), assuming
other phases and scheduling stay fixed. These are scenario estimates, not additive
benchmark promises. They do not predict early camera response, whose critical
path includes renderer preparation. A 3× camera target still needs its own
completed-draw comparison.

For each prototype, record exact candidate bytes, eligible names, wrap/glyph
measurements, candidates actually tested, longest uninterrupted work, first useful
label paint and final coverage. Validate full words, curve continuity, close
feature association, collision clearance, stable panning and cancellation before
adopting it. Static exhaustive placement can remain unchanged.
