# Interactive rendering backends

Implemented on 2026-09-09; candidate checks and measurements are recorded below. This
changes the interactive map's paint surface; the static sheet, elevation profile,
legend icons, authored geography, attribution and standalone delivery remain.
Output promotion and hosted publication are separate release operations.

## Running the candidates

The interactive builder defaults to Canvas. From `pipeline/`, using the project's
Python environment and existing terrain/vector caches:

```sh
python build_interactive.py
python build_interactive.py --renderer webgl --output grand_canyon_trails_webgl.html
```

Every generated interactive file also accepts `?renderer=svg`, `?renderer=canvas`
or `?renderer=webgl` before its `#v=...` camera fragment. The companion WebGL file
is useful when opening an absolute local path without adding a query string.
An unknown query value uses the SVG fallback. No additional network resources,
tiles, fonts, service workers or server are required to view these candidates.

## What moved to Canvas

`pipeline/render/scene.js` reads geometry, computed styling and browser-positioned
text from the authored SVG. Three persistent surfaces paint relief, contours and
foreground cartography. Water, roads, trails, labels, symbols, cartouche, scale and
neatline are painted on Canvas. Layer order and geographic vertices are retained.
The source SVG stays connected for font measurement, text-path references,
accessibility and fallback; it has zero paint opacity while Canvas is active.

Fast camera frames project the view directly, without changing SVG viewBox,
font variables or annotation transforms. Accepted labels are captured once as
screen-resolution sprites. Panning translates them without changing line breaks,
placement candidates or glyph sizes. Zoom moves their anchors and keeps their
screen size until the cancellable settled layout supplies new measured placements.
Glyph halos are painted across the whole text chunk before its fills.

Contours reuse parsed paths, visible-section culling and the existing 64-pixel
pan margin at their current scale. They remain on Canvas after settlement. Canvas
trail picking uses cached paths in reverse paint order, preserving the topmost
feature at shared segments. HTML controls and details retain their existing DOM
interaction. Hover repainting is confined to foreground cartography.

This completes the visible interactive-map paint migration. It does **not** remove
SVG parsing, embedded source geometry, browser typography measurement or settled
layout work. Those costs still affect startup and post-gesture work. Canvas is not
by itself a threefold startup improvement.

## WebGL prototype

WebGL 2 replaces the contour surface only. Relief and foreground use the same
Canvas renderer, making the comparison specifically about dense line rendering.
The prototype uploads 2,268,548 line segments (54,445,152 buffer bytes for the
current cached terrain) once, then updates camera and stroke uniforms. Instanced
quads provide round joins, butt/round endpoints and analytic antialiasing. Visible
chunk ranges cull offscreen segments; adjacent ranges merge before drawing.

A reusable coverage mask prevents dark seams where segments of a contour join.
The prototype unions contours with identical styling before applying their ink
opacity. Unlike separate SVG/Canvas path strokes, overlapping *different* paths
in that group do not accumulate opacity. Very dense contours can therefore look
lighter. Antialiasing also differs from native Canvas/SVG. This is an explicit
visual approximation, so WebGL remains an optional prototype.

Solid, round-joined polyline contours are supported. Unsupported contour syntax
or GPU initialization failure falls back to Canvas; a lost GPU context replaces
that surface with Canvas and redraws it. A preparation error is handled immediately, and disposal removes the controller
reference so deleted GPU resources cannot be reactivated. Contour groups unsupported by the Canvas
extractor fall back to SVG before it is hidden. Theme changes refresh GPU ink
without uploading geometry again.

Software WebGL is not representative of GPU performance: Chromium's headless
SwiftShader renderer was much slower on this map. The benchmark records the actual
WebGL renderer string. Performance claims below use Apple M3/Metal, not SwiftShader.

## Evidence and limits

Focused browser tests cover camera isolation, zoom transform stability, picking,
font failure, theme recapture, independent paint/typography collection, persistent
GPU buffers and context-loss fallback in Chromium, Firefox and WebKit.

Visible surfaces use device density capped at DPR 2. At the audited 1298×1068 CSS
pixel map size, reported RGBA allocations are about 22–25 MB at DPR 1 and 77–93 MB
at DPR 2, depending on backend and labels. These counts exclude SVG DOM/path data,
decoded source images and GPU driver overhead; GPU segment buffers are additional.

The managed audit reads Canvas paint commands and their actual draw offsets,
independently measures glyph metrics, and estimates symbol ink boundaries from
rasterized paths. It does not accept the solver's collision boxes as evidence.
Typography collection reads the painted font sizes and glyph angles. Its point
association bounds include font ascent/descent and advance, matching the SVG
text-box convention. This is finite geometric evidence, not a pixel-perfect
SVG/Canvas equivalence guarantee. Native glyph rasterization and fractional sprite
resampling can differ. Static/frozen SVG continues through the existing collectors.

```sh
npm run build:labels
npm run test:unit
npm run test:browser -- tests/browser/canvas-renderer.spec.js tests/browser/webgl-renderer.spec.js --workers=1
HEADED=1 PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/audit-renderers.mjs chromium pipeline/grand_canyon_trails_interactive.html
HEADED=1 PLAYWRIGHT_BROWSERS_PATH=.browser-cache node scripts/benchmark-renderers.mjs chromium BASELINE.html pipeline/grand_canyon_trails_interactive.html 3
```

Run browser workloads sequentially. Benchmark reports record input hashes,
engine/version, renderer, startup and gesture samples. Frame CPU time, rAF cadence,
and startup input latency are different measures; reaching a 60 Hz display's frame
limit cannot demonstrate a threefold frame-rate increase.

Measured results and the remaining startup limit belong in
[the performance record](PERFORMANCE.md). Candidate release and promotion remain
subject to [layout validation](LAYOUT_VALIDATION.md).
