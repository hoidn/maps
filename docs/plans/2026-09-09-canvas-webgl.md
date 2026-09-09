# Canvas migration and WebGL prototype

User-authorized implementation completed; integration record. Preserve standalone delivery,
authored geometry, attribution and map-use notice. Static map/profile SVG remain
outside this interactive-map backend change. No output promotion is implied.

## Design

Use one scene extracted from the authored SVG. Canvas 2D paints every visible
interactive-map layer, including terrain, contours, waterways, roads, trails,
labels, symbols and fixed map furniture. The retained SVG supplies typography
measurement, source geometry and a fallback, but fast camera frames must avoid
SVG camera writes, geometry measurements and hit testing. Canvas hit testing
preserves trail hover/click behavior. Text layout stays fixed while panning.

Prototype WebGL for the dominant contour geometry using persistent GPU segment
buffers and camera uniforms; retain the same Canvas foreground and terrain so
comparisons isolate the expensive contour backend. This is actual vector GPU
rendering, not a Canvas-image upload presented as a WebGL migration. Keep the
prototype explicitly selectable and fall back if GPU context creation/loss fails.

Alternatives considered: keeping the current SVG/Canvas gesture swap leaves
SVG layout in the camera loop; a full WebGL text/shapes rewrite increases scope
before proving the terrain/contour bottleneck. Shared scene and Canvas foreground
allow the latter to follow if measurements support it.

## Execution checklist

- [x] Add scene extraction, matrix projection and Canvas paint tests that fail first.
  Files: `pipeline/render/scene.js`, `canvas-renderer.js`,
  `tests/browser/canvas-renderer.spec.js`.
- [x] Integrate persistent Canvas rendering, fast footprint reuse and trail picking.
  Files: `pipeline/labels/runtime.js`, `pipeline/build_interactive.py`.
  Preserve SVG mode for direct comparisons and fallback.
- [x] Add GPU segment rendering, resource/context lifecycle and fallback tests.
  Files: `pipeline/render/webgl-contours.js`, `tests/browser/webgl-renderer.spec.js`.
- [x] Build standalone Canvas and WebGL candidates from the same caches. Validate
  painted geometry, layer/theme/detail transitions, DPR, labels, input and fallback.
  Adapt independent audit consumers deliberately to the Canvas paint boundary.
- [x] Benchmark startup, first zoom, continuous zoom, slow/fast pan and settlement
  sequentially on the same browser/viewport/data; capture hashes and report gains
  and regressions without promising 3× from backend choice alone.
- [x] Document fidelity/compatibility limits, select the validated default, commit
  and integrate after checking main for parallel changes. Preserve measured files.

Tests: `npm run test:unit`; focused `npm run test:browser -- ... --workers=1`;
independent rendered audits and screenshot comparisons at 1, 1.27, 2, 6, 14 zoom,
light/dark and DPR 1/2. Full release gate remains required for output promotion.

## Completion evidence

Canvas is the default, WebGL is an optional contour prototype and explicit SVG
mode remains available. Both standalone candidates were built from unchanged
caches. Measurement, fallback and paint-boundary tests passed in all three engines;
full-map evidence and measured gains are in `docs/PERFORMANCE.md` and
`docs/RENDERING_BACKENDS.md`. The pre-existing Firefox/light static-finalizer overlap
still prevents claiming a full release pass; no output promotion was performed.

The later reference-map comparison and portable cartography recommendations are
a separate user-requested investigation. This backend change does not implement
those proposed content, typography or source-selection changes.
