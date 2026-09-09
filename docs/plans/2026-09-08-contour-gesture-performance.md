# Contour gesture performance

Implemented following the slowdown introduced by the constant-width canvas
preview in `5656fe5`. This is local optimization evidence, not release approval.

The preview now indexes the original polylines in short sections, excludes
sections outside the view, and caches the visible paths. Adjacent visible
sections are merged before drawing so joins and opacity remain intact. All
original coordinates are retained; no simplification or resampling is applied.
Unsupported path syntax and dashed or capped strokes retain their full paths.

At a fixed zoom, a 64 CSS-pixel margin lets dragging reuse the same contour
pixels until the viewport crosses the margin. Zoom frames draw only the visible
viewport. Theme, visibility, scale, and pixel-density changes invalidate pixel
reuse. Pixel buffers remain within their existing budget; indexing additionally
retains numeric coordinates (about 35 MiB for this map) and section bounds.

## Validation and measurements

67 Node tests and 58 browser tests passed, with 2 intentional skips. Browser
checks cover Chromium, Firefox, and WebKit: widths through 14× zoom, detail
visibility, themes, toggles, buffer lifecycle, pan reuse, zoom invalidation, and
pixel comparison of joined sections against the original path. Small
browser-specific edge antialiasing differences are allowed in the pixel test;
its total coverage-error limit is 0.1%. Unit checks verify retained segments and
joins and fallback for unsupported path syntax.

Local Chromium/SwiftShader tests used a 1440 × 1000 viewport and 90 camera
updates. Before means `5656fe5`. Timing was highly sensitive to concurrent system
load; these are observations, not hardware-independent speed guarantees.

| Gesture | Before p95 frame | After p95 frame | Reduction |
|---|---:|---:|---:|
| Drag at 4.5×, quieter run | 38.0 ms | 24.5 ms | 36% |
| Drag at 14×, quieter run | 29.5 ms | 18.5 ms | 37% |
| Drag at 4.5×, final loaded run | 142.6 ms | 35.3 ms | 75% |
| Drag at 14×, final loaded run | 53.6 ms | 27.2 ms | 49% |
| Wheel zoom, final loaded run | 260.5 ms | 210.9 ms | 19% |

The quieter drag run preceded the final change that removes unused overscan
from wheel-zoom frames. The same drag reuse and geometry rendering were active.
A wheel run before that change measured 41.2 → 37.6 ms. The large spread between
runs prevents claiming a stable final absolute frame time or restored overall
performance targets. Fast JavaScript transaction time did not consistently
improve; savings come mainly from avoiding browser drawing work.

Reports and diagnostic scripts are in `artifacts/layout/contour-optimization/`:
`pan.json`, `final/performance.json`, `final-wheel/performance.json`, and test
logs. The maintained wheel benchmark is:

```sh
PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/benchmark-layout.mjs \
  --input pipeline/grand_canyon_trails_interactive.html \
  --report artifacts/layout/contour-optimization/recheck
```

Both cached map builders generated candidates during this task. The final
interactive candidate was rebuilt after the last runtime change. Static
finalization still rejects the missing Bright Angel Trail route label; neither
tracked deliverable in `output/` was promoted.
