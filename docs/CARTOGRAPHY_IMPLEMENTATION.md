# Portable cartography implementation and verification

Status: implementation installed in `feat/portable-cartography`; real-artifact
validation and promotion remain in progress. This records execution of the
[portable cartography plan](plans/2026-09-09-portable-cartography.md), following the
[dated reference comparison](CARTOGRAPHIC_COMPARISON.md).

## What changed

| Reference gap | General implementation | Limits |
|---|---|---|
| Small text and missing idle labels | 14 px places/trails, 12 px secondary text, 11 px contours, bounded 18% zoom growth and 100–150% text preference; cancellable idle preparation finishes eligible classes | Collision and scale omissions remain explicit; pans retain accepted candidates |
| Collapsed road/trail classes | OSM importance, surface, track quality, difficulty, access, lifecycle, bridge/tunnel and route membership retained; widths, casing, dashes, names, repeated refs and selection highlight | Missing tags remain unknown; reference badges use original text/halo styling, not proprietary highway symbols |
| Missing small connections | Buffered complete OSM geometry and relation members; unnamed links retained; scale-gated physical detail | Current OSM coverage is not proof of field completeness |
| Sparse hydrography/names | OSM + 3DHP polygons/lines and explicit GNIS-ID names; stable line windows, reverse/winding alternatives, centered lake labels and ring containment | No unconstrained nearest-name transfer; unmatched/conflicting source names remain reported |
| Missing facilities and local detail | Original geometric facility symbols, named points, scale-gated buildings with additive facility roles, searchable directory and generated settlement detail inset | Generic source data cannot establish current water availability or access |
| Distances and junctions | WGS84 geodesic lengths along actual OSM-node junction segments; one low-priority on-map label per eligible segment plus complete sourced endpoint tables | These are mapped path lengths, not surveyed hiking distances or river-mile stationing |
| Land cover and ownership | Neutral multidirectional relief plus independently toggleable Annual NLCD land cover and PAD-US/OSM administrative polygons, names and management tables | Land cover is categorical; ownership/designation is not a claim about current regulations |
| Map furniture | Live metric/imperial scale, optional geographic grid, shared-data inset and source/style legends | Dated declination, UTM grid, airspace and unavailable backcountry-unit GIS remain optional source work |
| Regional portability | Configured geographic frame and metric working CRS, registered rasters, complete source catalogs and the same shared feature/style code in Grand Canyon and Sequoia | Grand Canyon's authored composition/profile retain a guarded legacy terrain adapter; changing that frame uses the registered regional builder |

Source contracts and currency limitations are maintained in
[map data](specs/map-data.md) and [data sources](DATA_SOURCES.md).
Implementation choices above do not claim every detail of the commercial reference
has been reproduced. In particular, current rules/closures, agency vegetation,
backcountry permit zones and historical river-mile stationing need separately
verified sources. They are not inferred from the supplied raster.

## Final source-content completion

Facility rules now have distinct implemented glyphs for supplies, fuel, benches, waste,
saddles, gates/barriers, picnic areas/tables, telephones, fords and crossings. The generated
key explains these symbols without claiming present access or service. Re-normalizing the
existing OSM snapshots recovered 311 Grand Canyon and 79 Sequoia source features, including
230/67 ford nodes, 66/6 crossing nodes and 13/6 picnic tables. It also retained 62/6 linear
barriers as line geometry. Roads, trails and buildings kept their identities and counts.
Raw download and provenance hashes did not change; the four existing Sequoia normalization
issues remain reported. Future queries explicitly request standalone fords; that new query
was not represented as already run. Untagged transport lifecycle now remains `unknown`
without changing the default line appearance.

New peak labels attach numeric OSM `ele` values as elevations in feet. Annotation metadata
retains the original metres, source identity, field and conversion units; the vertical datum
remains unknown. Unparseable elevations stay absent. No DEM estimate is fabricated, and the
map does not repeat the provider abbreviation beside every summit.

Junction-segment mileage labels retain full source geometry and identifiers in the catalog
and complete tables. Each segment contributes at most one annotation, with declared mi/km
units, geodesic method and priority below names. Interactive labels are gated to at most
6 m per pixel. Generation measures the installed trail font's advance and omits windows
that cannot fit even at the supported 14× maximum (or full-view static scale), recording
the reason separately from source omissions. This generated 211/303 interactive and 36/70
static labels in Grand Canyon/Sequoia respectively, instead of embedding all 1,051/585 graph
segments as annotations. The isolated SVG-plus-manifest additions were at most 0.51/0.77 MB
for interactive maps; shared existing feature records make the actual increment smaller.
This font bound does not establish final fit: curvature, enlarged text, competing labels
and protected geometry still require the independent browser gate.

These Task 8/S17 and C07/C16/C23 corrections have focused regressions and rebuilt
candidates. The final seeded cross-engine review is recorded below; full release
validation and promotion remain pending.

## Why performance improved

The GPU paints contours while Canvas paints the remaining interactive scene and
label sprites. Camera movement reuses those resources. Text preparation stays
separate, cancellable and sliced; a longer total idle completion time does not
imply that the camera is blocked for that duration.

New cartography exposed avoidable work and correctness failures:

- Reject line windows outside the current viewport before measuring glyphs.
- Keep zero-area clipped water paths out of SVG entirely.
- Match protected-path collision queries to the renderer's ground-scale detail.
- Share a repair budget across all proposals/passes for an annotation; cache sorted
  candidate order and immutable hard-obstacle IDs within a solve.
- Commit a textPath's HTML and selected offset together. Replacing HTML afterward
  reset measured offsets to their original midpoint and produced misplaced text.
- Reserve observed cross-engine text expansion per annotation when freezing static
  output. Unrotated point labels can use directional margins; transformed labels
  retain a conservative uniform margin. Exact serialized audits still decide validity.

These are measured-work reductions or defect fixes, not an established 3× startup
claim. The separate [startup investigation](STARTUP_INVESTIGATION.md) records the
corrected latency probes, frozen baseline and diagnostic ablations.

## Visual fuzzing and reproduction

`node scripts/fuzz-cartography.mjs FILE REPORT_DIR SEED STEPS ENGINE BACKEND`
uses a recorded seed, browser version, DPR and exact HTML hash.
`node scripts/fuzz-cartography-matrix.mjs REPORT_DIR` runs the six-case pairwise
matrix, covering both regions and all three browsers and backends. Each run exercises
zoom, pan, wheel bursts, held/interrupted drags, text size, layers, themes, narrow
resizes, reset and rapid reversals. Node-side watchdogs can terminate an unresponsive
browser even when an in-page timer cannot run. Reports retain every action, state,
screenshot of the visible viewport and a contact sheet. Capturing a tall map element
can itself resize/scroll the browser and show an intermediate label frame; viewport
captures preserve the state being audited. Random interactions supplement the independent
geometry/typography checks and deterministic release profiles.

The first run found invalid empty clipped paths. Screenshot review found noisy
unnamed facility sentences and repeated place labels. Sequoia lake scenes revealed
missing centered label candidates and boundary widths growing with zoom. The
independent release paint audit then found the textPath-offset reset. Static screenshot review also found transparent interaction hit paths painting as black polygons; static scenes now omit those interaction-only paths. A strict displacement check found collision padding being counted as painted text in wrapped candidates. Distance checks now exclude that padding; a separate 0.125 px preparation reserve covers subpixel backend rounding while preserving the 32 px painted limit. Each fixed
behavior has a focused regression; a crash-free random run alone was not accepted
as proof of visual correctness.

The seeded browser matrix also caught a transient zero-size contour viewport
producing an infinite preview transform. The renderer now preserves its last finite
raster until a valid size returns. Resizing controls could cause a WebKit
`ResizeObserver` notification loop; both controller and live-scale geometry writes
now wait for the next animation frame. Fuzz idle checks first allow external resize
notifications to enqueue work, then wait for controller completion and presentation. A Firefox Canvas spring/name overlap came from glyph ink extending beyond
SVG text bounds. Interactive Canvas/WebGL placement now uses cached Canvas glyph
ink at SVG-provided positions, retaining line/glyph grouping, halos and shared
collision padding; static/SVG measurement and textPath overflow validation are
unchanged. A later exact-paint audit exposed the opposite error in the initial
union approach: extra SVG advance/em space made the nearest label edge appear
closer to its anchor than the painted Canvas text. Canvas-only footprints now
exclude that unpainted space. This preserves the 32 px distance limit without
increasing the tolerance or reducing font size.

Reports under `artifacts/cartography/` are development evidence. Final artifact
hashes, reviewed expected-feature subsets, matrix results and promotion status
will be recorded here after the complete release gate finishes.

Review also corrected road directory anchors/reference naming and scale-hidden path picking. Transport selection and mileage now use stable source identity or explicit route membership, so unrelated same-name and unnamed paths remain distinct. Building footprints retain their geometry while facility roles add interior-anchored symbols and names.


Wrapped point names reserve each painted line independently, including attached
secondary text and stroke halos. WebKit returns a parent-wide `tspan.getBBox()`,
so preparation unions each span's character extents instead. The independent SVG
audit uses character polygons for wrapped text. Pixel-coverage and blank-space
collision regressions pass in Chromium, Firefox and WebKit.

The real campground zoom sweep exposed a physical placement limit at one
intermediate zoom. With the actual enlarged-font metrics, a 1 px top-left grid
examined 42,860 authored-name and 44,285 equivalent OSM-name positions across all
four declared text layouts inside the unchanged 32 px painted displacement limit.
None avoided protected trails, even before competing labels were introduced.
This is finite-grid evidence, not a proof over every continuous subpixel position;
an early live-DOM probe had used an unnormalized hidden label and understated the
font size, so its apparent successful fit was discarded. Diagnostic inputs and
scripts are retained under `artifacts/cartography/camp-current*` and
`try-camp-current*`.

The regression therefore requires the anchored campground marker at all 14 sampled
views and its full name at at least 12. Any name omission must explicitly identify
protected trail geometry as the blocker for every equivalent name; budget,
stale-state and competing-label omissions fail. There is no zoom- or place-name
exception in production, no font reduction, no word removal and no trail waiver.


Scroll/drag fuzzing also found a coordinate-cache race during asynchronous label
preparation. A page scroll between 8 ms slices changed the live SVG measurement
frame while the job retained its earlier projected anchors. Scrolling back before
the final snapshot check could then commit a poisoned cache. Preparation now
validates its snapshot immediately after each yield, before writing more metrics;
a changed frame aborts and clears that job's measurements through the existing
cleanup path. A deterministic scroll-out/scroll-back fixture fails on the old
code by committing mismatched coordinates and passes with the guard. The complete
pan/scroll regression set passes 42 cases across all three browser engines.


Theme/reset visual review found two asynchronous rendering defects. Canvas/WebGL
scene refreshes now participate in `whenSettled()`, so pending image decoding
cannot return an old theme as a completed frame. Scene lifetime tokens are
separate from sprite invalidation: a font change during decoding must not cancel
the new theme. Overlapping refreshes and failure-to-SVG fallback have focused
regressions. Fixed cartouche commands recaptured after reset also refresh their
culling bounds; previously a theme prepared while zoomed could leave empty bounds
and permanently hide the title despite restored text commands. Pixel regressions
cover this zoom–theme–reset sequence across all three engines.

The broad browser run passed 518 cases with 10 declared skips, followed by all six
real-map water/proximity cases. Later focused glyph-ink, resize, theme and fixed-UI
regressions cover the changes made after that run. Source-to-paint review inspected
21 matched-ground-scale scenes in Grand Canyon and Sequoia, with hashes and
explicit scale/fit/collision omissions in the coverage baseline. These checks remain separate from the complete release gate and the final seeded
fuzz evidence below.


The next fuzz replay isolated a font-recovery cancellation bug: page scrolling could
abort the recovery pass after its sprites were cleared, then incorrectly resolve
idle waiters without retrying. Recovery now schedules a current replacement pass.
A separate WebKit screenshot preparation step reset unused FontFace load-status
bookkeeping on unchanged faces. The identity watcher now handles replacement/deletion;
real font-loading events handle load cycles. Its regression set still rejects missing
and broken fonts. A stabilized capture verifies that screenshot and independent audit
refer to the same renderer/font generation. Required font bytes are explicitly loaded
for audits instead of accepting unloaded faces. Targeted real Sequoia captures restore
314 overview annotations and 73 after resize. The subsequent enlarged-text overlap
was traced to reused SVG spans retaining old resolved `em` baseline advances in
WebKit. Wrapped variants now serialize their measured local baseline advance,
so a changed font size also updates the committed spacing. Cross-engine regressions
cover SVG/Canvas, primary text and attached elevations at 125%, 150% and reset.
The exact source-state replay keeps its candidate, position and font size while
restoring a 17.015 px label–ford gap.


## Final candidate visual evidence

The six 18-action seeded sequences passed automated checks and visual review of
all 114 successful viewport frames. The combined evidence selects five successful
runs from `artifacts/cartography/fuzz-release-candidate/` and one complete Grand
Canyon WebKit retry from `artifacts/cartography/fuzz-release-gc-webkit-retry/`.
The retry followed an audit font-readiness correction; its HTML bytes did not
change, and the original failed report is retained. The selection and exact report,
screenshot and HTML hashes are in `artifacts/cartography/fuzz-release-combined.json`.

Five narrow Grand Canyon views with no optional point names received independent
follow-up: all 901 repeated-state candidates were blocked by current controls or
frame bounds. No stale, unprepared or pending layout work explained those omissions.
`artifacts/cartography/final-point-states.json` retains the exact state comparison.
This is finite-view evidence; crowded narrow screens still constrain label coverage.

The reviewed interactive hashes are
`dd6f6da91d544ac3e0e63c734c1325637f1159179df0fc93810b27b1abb407e4`
(Grand Canyon) and
`93c66d5ca9d80990c308f86238062d30f3f79b347efcbc09006e0ce0d2da515a`
(Sequoia). All six frozen-static browser/theme audits passed for
`159e303f5fc550d532a0ff3013b6f8f7d9958b20d7fd62beafb2619247caa298`.
The final source suite passed 127 Python and 96 Node tests. Focused browser
regressions cover the subsequent font lifecycle, audit readiness and wrapped
baseline fixes; those counts are not added to the earlier broad suite as though
they were unique tests.

The full promotion gate was stopped after its first narrow Chromium profile
reported a native trail-pin check failure. Its other geometry, typography and
coverage checks passed. Diagnosis and the remaining release profiles are pending;
no delivered output has been replaced. The separate production 3× startup target
also remains unproven.
