# Map layout contract

**Status:** Maintained interfaces for the active automatic-layout implementation,
2026-09-08. **Release validation is pending.** This contract does not establish
that the current delivered maps pass or that hosted artifacts have been updated.

This document owns the manifest, measurement, placement, controller, and frozen
static interfaces. The [data contract](map-data.md) owns geographic coordinates,
units, source geometry, and artifact mapping; those conventions are not redefined
here. The [layout operations guide](../LAYOUT_VALIDATION.md) owns setup, commands,
rendering profiles, and operational limits. The [design](../plans/2026-09-08-automatic-map-layout-design.md)
records rationale and the [active plan](../plans/2026-09-08-automatic-map-layout-plan.md)
records execution steps, not release evidence.

## Annotation identity and ownership

The [manifest producer](../../pipeline/label_manifest.py) embeds a version-1 JSON
manifest in `script#map-label-manifest`. The manifest identifies map dimensions
and mode, features, and annotations. A feature has a stable `id`, an `anchor`,
a display name, and directory eligibility. An annotation has a unique `id`, an
identical `elementId`, a known `featureId`, a typed `kind`, and an `anchor`.
Layer, text/style, priority, required profiles, candidate variants, and geometry
references describe how that annotation participates in layout. Route
representatives can share a `requiredGroup`.

The [schema validator](../../pipeline/labels/schema.js) checks version, dimensions,
unique identities, typed kinds, feature references, and finite anchors. Each
managed SVG annotation has a wrapper with matching `id` and `data-layout-id`,
and its feature owner in `data-feature-id`. Labels and symbols are separate
annotations; constituent paths of one symbol are not separate points of interest.
Unwrapped map annotations are inventory failures, not inferred exceptions.

Moving an annotation changes its rendered placement, not the geographic feature
anchor. Shared ownership or a geometry reference alone never permits arbitrary
annotation overlap. Feature names remain available through the interactive
directory even when their optional map labels cannot fit.

## Measurement and policy boundary

Embedded fonts come from the checked-in [font assets](../../pipeline/labels/fonts/).
Layout waits for font readiness; incomplete font loading is a failure. Real font
loading events and face replacement/deletion invalidate live metrics. A transient
unloaded status on an unchanged face during stylesheet synchronization does not.
Font recovery retries placement when a changed viewport invalidates its measurement
snapshot, so idle completion requires a current committed result. The
[measurement module](../../pipeline/labels/measure.js) measures actual rendered
SVG in CSS pixels after transforms, including stroke/halo and multiline text.
Interactive Canvas/WebGL text uses Canvas glyph ink at the SVG-provided glyph
positions and angles, grouped into the same line/glyph parts. These footprints
exclude unpainted SVG advance/em space, so point displacement measures actual
paint rather than a larger collision-only proxy. Both modes retain stroke halos
and any shared measurement padding; `paintInset` identifies that padding for
point-distance checks. Spaces without ink add no empty parts, while combining
marks retain their painted extents. Static and explicit SVG measurement is unchanged.
Rotated straight text and text on a path use glyph footprints. Curved text must
fit its usable path in either backend; a clipped textPath is not an acceptable
shorter label.

Numeric and `px` textPath `dy` values describe a constant CSS-pixel baseline
offset after zoom normalization. `data-layout-authored-dy` preserves the authored
value through measurement clones and repeated commits; line applications carry
`textDy` and `authoredTextDy`. Candidate preparation also checks consecutive
browser glyph endpoints, rejecting discontinuities above 0.2 em (0.25 px floor).
This supplements path curvature/length checks; source names are never shortened
to rescue an invalid window.

[policy.json](../../pipeline/labels/policy.json) owns numerical clearance, edge
padding, displacement, repetition, minimum text sizes, required routes, font
families, and performance budgets. Consumers must use the same declared policy;
changing a threshold changes the evidence required for release. Geographic
coordinates must cross the measurement boundary before CSS-pixel constraints
are applied.

## Placement interface

The pure [solver](../../pipeline/labels/place.js) accepts
`solveLayout({annotations, obstacles, viewport, previous, policy, queryObstacles})`.
Candidates carry measured shapes with bounds and component rectangles. Obstacles
carry shapes or stroked line segments. An optional `queryObstacles` provider must
conservatively return every nearby painted obstacle; spatial indexing must not
omit a potentially colliding segment.

A provider may expose `forRegion(bounds)` to create a reusable local query.
The solver uses this for point-label candidate neighborhoods, including a
conservative allowance for dense fallback positions. The returned query must
fall back to the complete index for any rectangle outside its cached region.
The trail adapter caches screen-space segment projections once per camera
snapshot and grid-cell membership within each local neighborhood. Exact
stroked-bounds filtering and solver collision tests still run for every candidate;
these caches do not simplify geometry or carry collision results across camera
changes. The initial-placement worker keeps the immutable source-space trail
array and index between solves. Its transport sends that array again after a
source-array replacement or worker restart; every message carries the current
camera transform and ground scale. Unknown dataset references fail explicitly.
The cooperative fallback retains the complete source payload.


The result records accepted placements, an outcome for every annotation, and
missing required content. Candidate order and repair are bounded and deterministic.
Required content takes precedence over optional detail. Hiding every eligible
place name is not a successful interactive layout; release scenes require their
reviewed content coverage as well as geometric validity.

Cartographic manifests may attach `textImportance` (a numeric ranking score),
`textImportanceReason` (the semantic basis) and `textMaxMetersPerPixel` (a positive
ground-scale threshold, or null for no additional threshold) to text annotations.
`textImportance` supplies their solver priority. The controller rejects text above
its threshold with `below-text-importance` before measuring it. This interface does
not gate physical geometry or symbols, and does not replace their existing detail
limits. Older manifests without these fields retain their original selection.
Required destinations/routes have no additional text-importance scale threshold.
The shared generation policy and score tiers live in
[`text_importance.py`](../../pipeline/cartography/text_importance.py); they derive
from semantic classes, explicit requirements, mapped linear extent and numeric
source prominence, never names, region-specific exclusions or inferred popularity.
Line-label repetitions now require 360 CSS pixels of separation; point-name repeat
groups retain their independent limits. Full names and useful coverage still need
visual review, including dense and zoomed scenes.

`maxOptionalPointDisplacement` limits optional point text to 16 CSS pixels from
its feature; required static names retain `maxPointDisplacement` (32 px).
Candidate generation and solver validation use the nearest painted text extent,
excluding collision padding and static measurement reserves. A retained candidate
that moves beyond this limit during zoom is hidden with `feature-distance` until
fresh placement; a pure pan preserves the relative position. Symbols and region
labels retain their separate rules. Generic solver callers without either limit
remain unconstrained, preserving the existing standalone solver interface.

Protected trail strokes remain obstacles for text and displaced facilities. An
anchored symbol can cover a trail within its own measured footprint when that
footprint contains its true geographic anchor (`anchorTrailFootprint: true`).
This deliberate cartographic precedence keeps a campground or trailhead marker
visible on its access trail; it does not authorize text overlap, movement of the
feature, or overlap with another symbol. The independent DOM audit applies the
same rule using its own measured polygon bounds. The older 6px anchor-disk
exception remains available for displaced facility candidates; only trail
centerline portions inside that disk are exempt. Generic allowed-obstacle IDs
do not waive protected trails.

Place names rank positions by distance from the anchor to the label footprint,
in 4px bands (`pointDistanceBand`). Previous placement and authored order break
ties within a band; they cannot keep a label substantially farther away when a
closer candidate fits. If none fits, or the first valid placement is farther
than 12px (`pointPreferredDistance`), the solver lazily requests a denser set of
placements (2px grid interactively), nearest first across text variants, within the same
32px distance limit, including declared two- and three-line word-preserving
wraps. Every fallback undergoes the same collision and frame checks. Point
names and symbols are not dropped because the curved-label candidate budget
expires. Truly crowded or frame-edge content may still be omitted; these rules
do not guarantee every name can fit every possible view.

Interactive pan retention takes precedence over reranking an already chosen
placement: at a fixed scale, its position and text variant remain fixed. Ranking
applies when a label first receives a placement or its layout is invalidated.

## Interactive controller

The embedded engine exposes `window.mapLayout`. Consumers await `ready`, use
`requestView({x, y, w, h})` for camera changes, and await `whenSettled()` for the
settled result. `setLayer(layer, visible)` and `select(featureId)` coordinate
layer visibility and directory selection. `getReport()` returns current status,
view, outcomes, placements, missing required content, and timing samples.

Interactive startup measures private annotation clones in cooperative main-thread
slices and sends plain geometry and fallback-candidate inputs to an embedded worker.
Canvas/WebGL scene decoding and contour preparation proceed together. Contour
preparation prioritizes the tiers required by the current camera, independently
of source paint order. Once scene assets and every currently visible tier are
complete, the renderer can paint the complete base before labels are ready;
activation alone does not establish a completed frame.
While preparation or the initial solve is pending, camera/layer input remains active. A result is committed only if the camera, viewport,
controls and loaded font identities/status still match; otherwise it is recomputed.
`ready` resolves after a current initial placement and preview preparation complete.
The embedded worker also handles subsequent interactive settled solves. New
camera input cancels obsolete preparation and worker work. DOM-dependent
preparation yields between batches, measures hidden clones, and checks a snapshot
captured before yielding against the state at commit. Committed labels receive
the measured typography and selected text variant together with placement.
Worker construction/execution failure uses the same numerical solver in
cancellable cooperative slices on the main thread. These slices do not establish
a hard latency bound. Static finalization retains synchronous placement.
Workers are released on final page hide, including during initialization;
persisted page-cache transitions retain their state. Final page hide also
cancels pending placement and renderer scheduling.

Contour preparation exposes `readyFor(view)`/`isReady(view)` for complete visible
tiers and retains `ready`/`initialized` for the complete source inventory. SVG
motion previews continue to wait for complete inventory before detaching any
source contours. Persistent renderers expose `baseReady` for scene assets,
`ensureView(view)` for complete visible geometry, and `complete` for all
background preparation/uploads. WebGL uploads each newly required tier once,
keeps source paint order, and reuses buffers for subsequent camera movement.
Hidden tiers continue cooperatively; `whenSettled()` includes `geometryPending`
until the complete background inventory is prepared. A camera requesting a still
pending tier retains the last complete Canvas/WebGL frame until that tier is
ready; it does not publish a new `paintedView`/`paintedRevision` for incomplete
geometry. Deep initial views wait for all their required tiers. Unsupported
late WebGL geometry follows the same complete Canvas fallback as initial failure.
These interfaces do not promise a latency bound for a first visit to pending
high-detail geometry, or establish the separate startup speedup target.

Interactive source paths may use the lossless
[embedded contour payload](map-data.md#embedded-interactive-contour-geometry).
The store retains decoded Float64 world-coordinate runs; `ContourPreview.items`
keeps the same source-element, runs, chunks and bounds interface as inline SVG.
Canvas/WebGL prepare those runs directly. A contour used by a text path receives
its exact native `d` before DOM measurement, with the placement snapshot checked
again after asynchronous hydration. Native SVG mode and renderer fallback
hydrate the complete authored contour inventory before publishing a settled
native view. Fallback hydration participates in controller idle; failed decoding
cannot become successful readiness merely because a pending counter reached
zero. Final page hide rejects pending decoding and prevents later source writes.
Frozen static finalization and its JavaScript-disabled delivery are unchanged.

Interactive pointer drags defer scheduled settled layout until all accepted
pointers are released, cancelled or lose capture (window blur also releases the
hold). Wheel input requires 120 ms without another wheel event, followed by two
quiet animation frames. Camera input still requests a fast frame immediately.
`whenSettled()` remains pending while a changed view awaits gesture release.
Stationary pointer clicks alone do not request a new layout.

Camera changes and accepted annotation visibility are committed together before
paint. Interaction can temporarily hide optional detail while preserving a safe
frame; settled layout restores feasible content. Pure panning reprojects cached
label footprints and preserves each chosen offset, line position and text wrap.
Labels crossing the frame or controls can be hidden and restored unchanged.
Newly revealed labels can be placed at settlement, respecting both the occupied
footprints and feature repeat distances of existing cached placements, including
temporarily hidden labels. Font, layer, viewport-size or zoom changes invalidate
these reservations. The cache covers the current scale, not every prior zoom.
Pure pan frames reuse known trail clearance; new placements and zoom transactions
retain the ordinary geometry checks. Controller diagnostics are
useful for debugging, but are not independent proof that rendered geometry fits.

## Frozen static artifact

The static builder's immediate HTML is staging content that still needs the
layout runtime. [finalizeStatic](../../scripts/finalize-static.mjs), exported as
`finalizeStatic({input, output, viewport, ...})`, resolves the static profile at
the map's declared natural size, waits for settled layout, and rejects missing
required content or runtime errors.

The finalizer bakes visibility, transforms, and typography into the serialized
SVG. It marks the document and SVG with `data-layout-frozen="true"`, preserves
inert `map-layout-frozen-report` metadata, and removes the layout runtime and its
added directory/details controls. Unrelated existing page interaction can remain;
map annotation readability must not require JavaScript.

Before replacing the destination, the finalizer independently audits the
serialized candidate with JavaScript disabled and external networking blocked
in the supported browser/theme matrix. The exact audited bytes are identified
by hash. Failure leaves any prior destination unchanged. The declared natural
map size, or an explicit physical print profile below, is the static layout boundary; arbitrary reflow or export settings are
not established by that validation. See the owning [artifact mapping](map-data.md#artifacts-and-ownership)
for staging, finalized, and delivered filenames.

### Physical print profile

Static manifests may carry `map.print` version 1. It declares physical paper dimensions
in millimetres or a nominal scale denominator, trim/tick margins, the point-size hierarchy,
available contour intervals and geodesic ground dimensions. The geographic viewBox and
feature anchors remain unchanged. A print request cannot select interactive mode.

Static preparation may omit paint and optional annotations that the existing ground-scale
limits make ineligible throughout the requested sheet's possible size range. Natural static
sheets use their native size; print preparation uses an upper bound on map width before the
collar is measured, with one CSS pixel reserved for dimension rounding. It retains source
feature records and all required annotations. `map.staticPreparation` records the resulting
minimum metres per pixel and counts of removed geometry elements and optional annotations.
Thus preparation cannot hide a required-content failure or remove detail that could fit.

Staging SVGs carry `data-layout-pending` to defer layout during HTML parsing. Browser bootstrap
removes it before constructing the controller or measuring geometry. Frozen output retains
the restored visible state and requires no bootstrap code.

The composer gives authored and portable annotations the same anchor-relative physical
sizing. The finalizer measures the complete potential collar, resolves the map rectangle,
then measures fonts and places labels at that reference transform. It compensates text,
symbols and strokes for CSS pixels per map unit; it does not apply interactive zoom growth.
Coordinate ticks remain outside the annotation rectangle. Hidden optional entries are
removed from the legend after placement without moving the map.

Nominal scale is east–west at the frame's centre latitude, calculated with WGS84 geodesic
distance. The retained longitude/latitude affine frame is not a constant-scale projected
sheet. Frozen metadata records page/map millimetres, the reference size in CSS pixels,
centre/north/south east–west ratios, north–south ratio, contour interval and raster evidence.
Paper-only requests fit the frame around the measured collar. Scale-only requests derive
paper dimensions. Combined requests reject overflow rather than alter the supplied scale.

Only available contour elevations are printed at a uniform selected interval. The authored
static adapter has 250 ft detail; portable tiers are filtered numerically. The collar states
the actual interval, source dates and coordinate model. It includes no unverified magnetic
declination or vertical datum. Print paint is explicitly light, including dark host environments.

The existing six independent frozen-static audits remain required. The PDF exporter also
checks collar bounds, page geometry, embedded fonts, map-interior vector/text operations,
relief preservation and a rasterized calibration bar. Exact operating limits and commands
belong to [layout operations](../LAYOUT_VALIDATION.md#regional-builds-and-large-format-pdfs).

## Independent acceptance evidence

The [managed audit](../../scripts/audit-map.mjs) remeasures visible SVG annotations
or Canvas paint commands and their actual draw offsets,
fixed controls, and protected trail strokes without importing production solver
acceptance logic. It checks ownership inventory, collisions, clipping, required
content, and typography. Hidden annotations remain in the outcome inventory.
Static required profiles and required route groups must have their required
visible names; a symbol does not substitute for a required name.
The manifest's `map.requiredRoutes` owns regional route requirements for solving
and independent static auditing. An explicit empty array requires no route names;
the global policy is a compatibility fallback only when the field is absent.
Independent audit views record the effective `requiredRoutes` list.

Reports identify candidate bytes, policy, fonts, browser, theme, and view. Legacy
mode records baseline failures and cannot serve as a managed-release allowlist.
Interactive [release scenes](../../tests/fixtures/layout-scenes.json) need frozen
coverage review, complete scene evidence, and performance evidence before
[pair verification and promotion](../../scripts/verify-maps.mjs) can pass. Promotion
uses matching snapshots and rollback, rather than copying unverified builder output.

Automated scenes and observed frames are finite evidence for declared profiles.
They do not prove every possible browser, font substitution, zoom trajectory,
export environment, or real touch device. The operations guide specifies the
current supported checks and limits. Until the real candidate pair passes them,
release validation remains pending.

## Interactive Canvas and WebGL paint boundary

Interactive candidates default to persistent Canvas paint. `?renderer=svg` retains
SVG mode; `?renderer=webgl` selects the experimental GPU contour surface. The
[backend guide](../RENDERING_BACKENDS.md) owns operation, implementation explanation,
measured comparison and prototype fidelity limits.

The manifest and placement interfaces above are unchanged. SVG annotations remain
connected measurement sources with their existing identities. Canvas paints their
accepted glyph/shape commands; visibility is established by the painted inventory,
not the hidden measurement SVG. Pure pan translates accepted screen-size text
without relayout. Fast camera frames do not mutate the measurement SVG camera.
Settled layout can update it to obtain fresh typography metrics after zoom.

`whenSettled()` also waits for asynchronous Canvas/WebGL theme scene preparation
and the resulting scheduled paint. The renderer counts all pending refresh
generations through completion or failure; an obsolete refresh cannot replace
the latest scene. Font-dependent sprite invalidation does not cancel a pending
theme scene; renderer destruction does. A preparation failure restores SVG rendering and drains the
controller through its normal scheduled fallback layout.

Independent Canvas collectors measure paint commands and draw offsets, glyph font
metrics and symbol ink; SVG collectors still apply to static, frozen and explicit
SVG mode. Consumers that equated SVG visibility with interactive map visibility
must use this paint boundary. Font/layout failure clears visible Canvas labels. `getReport().renderer` adds
requested/active backend, fallback reason, estimated RGBA bytes and GPU buffer bytes;
these memory counts exclude source DOM, decoded images and driver overhead.

## Interactive line widths

The camera sets the line-scale variable `--s` to `1 / zoom`. Trails, contours,
waterway centerlines, roads, trail dash patterns and hit targets retain their overview
screen dimensions at a fixed viewport size. Protected trail queries use the
same inverse-zoom factor; cached base widths are recovered by multiplying the
current SVG stroke width by zoom. Static line styling is unchanged. In explicit SVG mode, embedded raster relief images remain in the live SVG without startup re-encoding.
The following temporary-preview behavior describes explicit SVG mode. Canvas
mode keeps relief and vector foreground on persistent surfaces instead.
Other background content retains the bounded temporary raster preview. Contour paths are
prepared in yielding batches, parsed once and redrawn on a bounded canvas at the current camera scale, stroke
width, theme, and detail level. Generated polylines retain every vertex; cached
section bounds exclude offscreen segments, and contiguous sections are merged
before stroking to preserve joins and opacity. A 64 CSS-pixel overscan margin
lets pans reuse pixels at the same scale; zoom frames omit that margin.
Raster density is chosen with the margin allowance for both modes. Raster
origins lie on a fixed world-aligned pixel grid, and the canvas uses integer
bitmap dimensions positioned by an SVG transform. This avoids high-zoom HTML
layout rounding and changes in raster phase when a pan refreshes the cache.
Zoom, theme, layer, pixel-density,
or viewport-scale changes invalidate that reuse. They are never enlarged from
an overview bitmap.
The original contour SVG is restored for settled views. Roads, waterways,
water-area polygons and trails remain live SVG throughout gestures. Relief and
contour preview pixel buffers share the 24MiB budget. Unsupported transformed
or annotated contour groups stay live instead of being rasterized.
Paths referenced by visible or recoverable cached elevation text remain connected in temporary,
non-painted SVG definitions during motion. The preview moves the original nodes
and restores their original positions at settlement; it does not duplicate their
geometry or invalidate the textPath references.
Filled river-bank polygons retain geographic dimensions and
widen naturally with zoom; their width is not controlled by `--s`.

## Progressive cartographic preparation

The initial pass uses a soft 24 ms candidate preparation budget and attempts up
to eight distinct eligible named features, ordered by text importance with primary
point names first, plus their associated markers. That minimum seed may extend
the soft budget through the same cooperative 8 ms slices. Other uncached
annotations are deferred; they are not all cloned before applying the budget.
Collision and protected-geometry checks still govern placement, so attempting
eight names does not promise that eight names physically fit. Subsequent idle
preparation visits every eligible annotation through cancellable slices; yielding
time does not consume a final cutoff. `whenSettled()` waits for that preparation.
`initialLabelBatch` records actual first-pass named-feature and symbol counts,
paint time, eligible named-feature count, and whether at least eight names (or
all eligible names in a smaller view) were painted. `firstUsefulLabels` records
the first committed frame meeting that threshold; it is absent until one does.
These are diagnostic milestones, separate from `ready` and `whenSettled()`.
After the startup seed, interactive settled placement runs three rounds: primary
text with importance at least 800, context text with importance at least 700,
then all remaining eligible detail. Each successful round leaves two animation
boundaries for browser paint before the next round starts measuring. Lower-round
text receives a temporary `round-deferred` outcome and is not precloned or
measured early. Symbols keep their independent eligibility in every round.
Accepted earlier placements become fixed reservations; existing placements also
bypass temporary round filtering during pure panning, so the round sequence does
not remove or rewrap already placed lower-priority text. The final round considers
the entire eligible inventory. `whenSettled()` spans all rounds and retries;
camera, font, gesture, viewport, control or scroll changes discard obsolete work.
Within one unchanged round token, a completely attempted optional domain that
failed remains infeasible as accepted reservations only grow. The controller may
reuse its exact outcome and blocker IDs via prepared `cachedFailure`, guarded by
`policy.reuseRoundFailures`, `repairMaxNeighbors: 0` and
`exhaustiveDiagnostics: false`. Required annotations, required groups and exhaustive
or repairable solves reject this opt-in. Deferred, disabled, outside-view and
invalid-metric annotations never establish a reusable failure. The cache is local
to that camera/font/control token and does not survive any invalidation. This
extends the prepared solver input only; older callers and generated manifests
need no new fields.
Timing samples identify the round without excluding preparation, solve or commit
work. Static placement remains the existing exhaustive single pass. This changes
progress visibility; it does not establish an end-to-end speedup.

Candidate diagnostics distinguish path/window, reverse-direction, upright-glyph
and overflow rejection. Curved waterways with no readable path window may use a
measured straight name beside the same geometry; source paths are unchanged.

Interactive typography uses semantic minimum sizes, modest bounded growth with
zoom/ground scale, and a persisted 1–1.5 readability multiplier. Source settlements
(city, town, village, hamlet and populated-place records) use `l-settlement`;
major roads use `l-road-major`, selected from network class rather than spelling.
The default policy sets settlements to 18 CSS px, local roads to 12 px, and major
roads, route references and trails to 14 px before growth/preferences. Ordinary
place labels retain their existing 14 px size. The shared stylesheet supplies the
same class hierarchy to static maps; the independent typography audit recognizes
these classes without importing the production normalization function. Static typography
retains its print profile. Zoom/font settings trigger measurement; pan retains
accepted size, wrapping and placement.

### Portable cartography and idle completion

Annotations may carry source identities and a maximum ground resolution
(`maxMetersPerPixel`). Screen text uses the readability profile and a persisted
multiplier; static labels retain their print-oriented stylesheet sizes. Geographic
geometry is shared across backends. Layer selection must govern both plain paint
and its associated annotations.

Startup placements are provisional until full idle preparation completes. A real
pan locks the accepted placements; a zoom or text-size change may choose new
ones. Initial asynchronous acceptance includes typography/revision in its state
snapshot, preventing old footprints from committing under a new text preference.

Performance report schema v2 keeps transaction and frame limits as hard gates.
`settledMs` is total time from the final wheel frame until idle label completion,
including the intentional wheel quiet period, animation-frame waits and yielded
work. It is informational in this warm-camera gate; that does not establish
acceptable initial label latency or satisfy the separate startup target.
Error, nonfinite or incomplete results still fail. This does not establish the
separate 3× startup target. See [startup investigation](../STARTUP_INVESTIGATION.md).

Area annotations may provide `areaPolygons`: an array of polygons, each containing
an exterior ring followed by hole rings, with closed `[x,y]` pairs in world SVG
coordinates. Settled preparation and the SVG fast path project eligible rings
into CSS coordinates. Canvas fast preparation instead retains the immutable
world rings and supplies optional `areaTransform: {a,b,c,d,e,f}` on the prepared
annotation. Without that field, solver `areaPolygons` retain their existing
CSS-coordinate meaning. Both representations are plain structured-clone data
and are accepted by synchronous and worker placement.

For axis-aligned pan/zoom (including nonuniform scale and reflection), containment
reuses a camera-independent edge index. Inverse transforms only select a
conservative set of potentially relevant edges; final ray-crossing and rectangle
intersection checks project those original endpoints into CSS coordinates.
Rotation, shear and degenerate transforms use the existing full-projection path.
The indexed rings must remain immutable; a changed polygon needs a new ring
array identity. Cached geometry does not retain camera state or candidate results.

Every measured rectangle must remain within its owning polygon without
touching/crossing exterior or hole boundaries; a hole entirely enclosed by a text
rectangle also rejects it. Separate footprint parts may occupy separate polygon
components. The diagnostic blocker is `area-boundary`. This constraint does not
replace label/trail/control clearance.

### Portable label spacing and static font envelopes

`repeatGroup` optionally groups equal displayed names for screen-space repetition;
`featureId` and `sourceId` keep physical identity. This never merges source records
or moves features. `repeatDistance` applies during settled placement and retained
pan reservations. Point-area labels may try a centered interior candidate; every
candidate must still satisfy the full ring/hole containment rule.

Static finalization may supply `measurementReserves[id]` as a nonnegative pixel
margin or `{left, top, right, bottom}` margins. The solver expands that annotation's
candidate footprints before collision/frame checks, including lazy alternatives.
Untransformed font probes only justify directional margins for unit-scale,
unrotated point labels; other text retains a conservative scalar margin.
The finalizer keeps measured probe evidence and reaudits exact serialized bytes in
all three browser engines and both themes. Font padding is not an audit exemption.

`repairBudget` bounds neighbor probes across all proposals and required/group/final
passes for each annotation in a solve. Immutable hard-obstacle diagnostics and
candidate ordering may be cached only within that solve. Protected path queries
use the same declared `data-max-mpp` detail as painting, including zoom changes.

Interactive point candidate preparation reserves 0.125 CSS px inside the declared
maximum displacement for cross-backend subpixel glyph rounding. The independent
paint audit retains the full 32 px limit; static required-point grids retain their
existing radius. `pointPaintReserve` applies to candidate filtering, including
serialized lazy fallbacks, and does not relax geometry or typography checks.

A measured shape may carry `paintInset` (CSS px) when its collision envelope
includes extra measurement padding. Point displacement is checked against the
painted bounds obtained by removing that inset, including wrapped/lazy variants.
The padded footprint remains authoritative for collisions and containment.

Portable POI priority derives from source categories or an authored symbol sharing
the same feature ID, not font class alone. Explicit configured required point
destinations receive priority 1000 in both modes; static requiredness remains
profile-specific. One canonical annotation represents each configured required
name, so duplicate source representations do not each become required.

Static freezing may set `fixedControlReserves`, ordered by the SVG
`.cartouche,.scale` query, to directional CSS-pixel reserves measured across the
release browser engines. Controller control obstacles include those reserves;
independent audits still check actual serialized control/text paint. The default
interactive controller uses no reserves.
