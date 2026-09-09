# Layout performance: first round

Implemented 2026-09-08. This is optimization evidence, not release approval.

The expensive point-label search repeatedly queried and projected the same
protected trail segments. The first round caches projected segments for one
camera snapshot and builds a small reusable spatial index for each point label's
candidate neighborhood. Nearby candidate rectangles also reuse grid-cell
membership; exact stroke-bound filtering and collision tests remain active.
Queries outside a cached neighborhood fall back to the complete index.

No geometry reduction, label omission budget, distance relaxation, or worker
migration was introduced. The maintained interface is documented in the
[layout contract](../specs/map-layout.md#placement-interface).

## Measurements

Same local benchmark profile: headless Chromium, 1440 × 1000 viewport, Apple M3,
SwiftShader renderer, 90 synthetic wheel updates. These are single-run local
measurements, not a hardware-independent speed guarantee.

| Measurement | Before | After |
|---|---:|---:|
| Post-gesture settlement | 1955.2 ms | 408.6 ms |
| Cold settled layout | 1969.6 ms | 393.7 ms |
| Settled solver phase | 1877.3 ms | 335.2 ms |
| Fast transaction p95 | 11.1 ms | 11.3 ms |
| Frame interval p95 | 21.1 ms | 23.6 ms |

Settlement improved about 79%; gesture timing did not improve in this run.
The 100ms settlement and 8ms fast-transaction targets remain unmet.

On an identical real-map input to both solver variants, full-index queries fell
from 47,239 to 544. All 226 placements were identical. Independent audits at
Havasupai Gardens 2×/14× and Horseshoe Mesa 3.25× found no overlaps, clipping,
missing required content, or unknown annotations.

Validation: 65 JavaScript unit tests passed; 97 selected browser tests passed
across Chromium, Firefox and WebKit, with 2 intentional skips. The browser checks
include campground visibility, point proximity, stroke widths, frame lifecycle,
and independent managed audits. Both builders generated candidates; static
finalization still rejects the existing missing Bright Angel Trail route label.
Delivered files in `output/` were not promoted.

Benchmark artifacts are under `artifacts/layout/current-performance/` and
`artifacts/layout/performance-round1-final/`; equivalence/audit evidence is
`artifacts/layout/performance-round1-validation.json`. Reproduce timing with:

```sh
PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/benchmark-layout.mjs \
  --input pipeline/grand_canyon_trails_interactive.html \
  --report artifacts/layout/performance-round1-final
```
