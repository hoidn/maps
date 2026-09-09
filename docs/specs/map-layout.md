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
Layout waits for font readiness; incomplete font loading is a failure. The
[measurement module](../../pipeline/labels/measure.js) measures actual rendered
SVG in CSS pixels after transforms, including stroke/halo and multiline text.
Rotated straight text and text on a path use glyph footprints. Curved text must
fit its usable path; a clipped textPath is not an acceptable shorter label.

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

The result records accepted placements, an outcome for every annotation, and
missing required content. Candidate order and repair are bounded and deterministic.
Required content takes precedence over optional detail. Hiding every eligible
place name is not a successful interactive layout; release scenes require their
reviewed content coverage as well as geometric validity.

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

Place names try their usual positions first. If none fits, the solver lazily
requests a denser set of placements (2px grid interactively) within the same
32px distance limit, including declared two- and three-line word-preserving
wraps. Every fallback undergoes the same collision and frame checks. Point
names and symbols are not dropped because the curved-label candidate budget
expires. Truly crowded or frame-edge content may still be omitted; these rules
do not guarantee every name can fit every possible view.

## Interactive controller

The embedded engine exposes `window.mapLayout`. Consumers await `ready`, use
`requestView({x, y, w, h})` for camera changes, and await `whenSettled()` for the
settled result. `setLayer(layer, visible)` and `select(featureId)` coordinate
layer visibility and directory selection. `getReport()` returns current status,
view, outcomes, placements, missing required content, and timing samples.

Camera changes and accepted annotation visibility are committed together before
paint. Interaction can temporarily hide optional detail while preserving a safe
frame; settled layout restores feasible content. Controller diagnostics are
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
map size is the static layout boundary; arbitrary reflow or export settings are
not established by that validation. See the owning [artifact mapping](map-data.md#artifacts-and-ownership)
for staging, finalized, and delivered filenames.

## Independent acceptance evidence

The [managed audit](../../scripts/audit-map.mjs) remeasures visible DOM annotations,
fixed controls, and protected trail strokes without importing production solver
acceptance logic. It checks ownership inventory, collisions, clipping, required
content, and typography. Hidden annotations remain in the outcome inventory.
Static required profiles and required route groups must have their required
visible names; a symbol does not substitute for a required name.

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

## Interactive line widths

The camera sets the line-scale variable `--s` to `1 / zoom`. Trails, contours,
waterway centerlines, roads, trail dash patterns and hit targets retain their overview
screen dimensions at a fixed viewport size. Protected trail queries use the
same inverse-zoom factor; cached base widths are recovered by multiplying the
current SVG stroke width by zoom. Static line styling is unchanged. The cached
background preview remains a temporary raster during motion; settled views use
the original SVG. Filled river-bank polygons retain geographic dimensions and
widen naturally with zoom; their width is not controlled by `--s`.
