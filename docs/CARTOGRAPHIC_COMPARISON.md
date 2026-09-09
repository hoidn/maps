# Reference-map comparison and portable cartography recommendations

Historical baseline investigation, 2026-09-09. The findings below describe the inspected
baseline; installed changes and current verification status are recorded in
[implementation and verification](CARTOGRAPHY_IMPLEMENTATION.md).
The implementation sequence is in the [portable cartography plan](plans/2026-09-09-portable-cartography.md).
The separately implemented [Canvas/WebGL migration](RENDERING_BACKENDS.md) is integrated
at `8336d94`; no delivered files in `output/` were promoted.

## Findings

The most useful improvements are larger, better prioritized labels; reliable waterway
label placement; preservation of road/trail attributes; broader source coverage; and
separate vegetation and administrative layers. These are mostly ordinary data-pipeline
and cartographic engineering. Matching every detail of a professionally edited hiking
map requires ongoing source reconciliation and editorial review, but does not require
tracing the reference or writing a special renderer for each park.

**Fonts:** yes, text is too small relative to the available detail at deep zoom.
The current controller keeps places and hydrography at 12 CSS pixels, minor/peak labels
and secondary text at 10, trails at 13, and major/region labels at 14. Zoom changes
geographic scale but does not enlarge these screen sizes. The old design guide's
`zoom^-0.55` description predates the controller and is not the current policy.
Start testing places/trails at 14–16 px, secondary text at 12–13, and contours at
11–12, with a user readability setting and modest bounded growth with ground scale.
These are proposed starting values, not established optimal sizes. Recompute layout
on zoom/font-setting changes; preserve placement and wrapping during pans.

**OSM gradation:** no, we discard or fail to fetch much of it. Roads become two
visual classes, selected partly by a name allowlist. Trail classes come from manually
named lists and geographic splits. Surface, access, difficulty, visibility, track
quality, route membership and road references are not carried through consistently.
Those dimensions should remain separate: road importance is not surface quality;
a backcountry management zone is not a technical hiking grade.

**Water names:** this is a combination of missing source names, deliberate omissions,
insufficient label candidates and runtime failures. It is not just decluttering.
The cached inventory contains 609 waterway ways, 534 unnamed. Nine real waterway names
are explicitly excluded by substring filters. The generated manifest has 35 hydro
annotations for 32 real names plus an erroneous `?` name. In seven sampled views,
all 35 were reported `budget-deferred`. Raising the candidate budget to 5,000 ms in a
browser-only diagnostic changed 34 to `no-valid-candidate`; the only hydro annotation
placed at overview was `?`. This experiment is not a proposed budget increase.
Scheduling and candidate validity both need correction before judging data sufficiency.

**WebGL and the budget:** WebGL accelerates contour painting. The controller's separate
`interactiveCandidateBudgetMs` defaults to 24 ms, measures elapsed time, and does not
expand with GPU headroom. Font/path measurement and label candidate generation remain
CPU/DOM work. Cooperative yields can consume this elapsed deadline too. Deferred labels
are not guaranteed eventual consideration by the current pass. More GPU capacity can
help responsiveness while background label work progresses, but cannot fix invalid
path windows or a missing name. Use a resumable, cancellable preparation queue with
fairness across feature classes, rather than one larger blocking pass.

## Scope and evidence

Reference: the user-supplied `TI00000261_2_XL.webp`, 1689×2500 pixels, headed “East Side.”
It is a side of Trails Illustrated **261, North and South Rims**, not the separately
numbered Grand Canyon East map. [National Geographic's catalog](https://www.natgeomaps.com/ti-grand-canyon-national-park-map-pack-bundle)
distinguishes those products. Edition/date and the complete symbol legend are not
available in this image. The raster permits a systematic feature/style-class comparison,
not an exhaustive transcription of every tiny name or proof of current conditions.

Our inspected candidate has SHA-256
`81e4df40f3827c7a6ebc92a96aa61e68c473a80efe788b5bc78718283e2cd035`.
Inspection covered the light-theme overview, central views at 2×/6×/14×, and 6× views
around Grand Canyon Village, North Rim and Cape Royal, in Chromium at 1440×1200/DPR 1.
Separate backend validation covers both themes and all three browser engines; it does
not establish content completeness. Reference print text cannot be compared in physical
point size with a resized raster on a screen.

Our extent is 35.990–36.232° N, −112.262–−111.898° longitude. The reference extends much
farther north/east/south; ours includes western Hermit/Boucher terrain outside much of
this East Side image. Separate **missing content inside the shared footprint** from
**content outside our current frame**. The reference is not a strict superset.

Evidence files:

- [Cached source inventory](cartography/2026-09-09-source-inventory.json): merged OSM
  elements, counting ways whose geometry bounding boxes intersect our frame. This is
  an upper bound for spatial intersection, not counts of distinct roads or a fresh OSM survey.
- [Rendered inventory](cartography/2026-09-09-rendered-inventory.json): actual painted
  font sizes, placements and hydro outcomes for the seven sampled views.
- [Larger-budget diagnostic](cartography/2026-09-09-budget-experiment.json): overview
  and 6× with only the in-memory budget increased. Candidate rejection subcauses remain
  to be instrumented; do not assume all 34 failures have the same cause.
- Source inspection: `fetch_osm.py`, `fetch_osm2.py`, `osmdata.py`, `fetch_water.py`,
  `build_interactive.py`, `labels/runtime.js`, `labels/line-candidates.js`, and
  `labels/policy.json`. Builders were inspected without importing them.

The raw inventory has 755 highway ways: 209 footway, 146 path, 139 residential,
90 unclassified, 76 tertiary, 36 track, 28 primary, 9 construction, 7 secondary,
7 cycleway, 6 steps, 1 bridleway and 1 service. Available attributes include surface
on 483 ways, smoothness on 86, tracktype on 50, hiking difficulty on 64, trail visibility
on 35, road references on 38, bridge on 14 and tunnel on 3. Tag absence is common;
unknown values must remain unknown. The fetch itself is selective, so these totals
understate what a complete area acquisition might contain.

## Style differences

Effort estimates assume the common feature model and reusable symbol/style plumbing
below: **S** ≤1 engineering day, **M** 2–5 days, **L** 1–2 weeks, **O** ongoing editorial
or source maintenance. They are rough incremental estimates, overlap, and are not
additive promises. “Superior” is a judgment for a detailed hiking map; some choices
are tradeoffs rather than defects. Content dependencies are listed in the next table.

| ID | Element and reference treatment | Our difference; assessment | General remedy and feasibility |
|---|---|---|---|
| S01 | Strong text hierarchy over relatively quiet terrain | Deep-zoom 10–12 px labels compete with dense relief; reference hierarchy is superior | Screen-space type scale, readability control, ground-scale detail rules; M |
| S02 | Natural-feature italic text, settlement/facility text and widely spaced area names have distinct roles | We have some font differentiation, but water labels are mostly absent and regions are limited; reference is richer | Semantic style tokens for water, landform, settlement, management and facility names; S–M after coverage fixes |
| S03 | Many names follow an appropriate stretch of the feature | One selected stream run and a few river offsets cannot cover a moving viewport | Whole-feature chain windows, upright alternate direction, stable world anchors and repeat spacing; L |
| S04 | Text remains readable against contour detail | Our halos can look broad and secondary text faint/small; thicker outlines alone would worsen this | Test ink/halo contrast and weight together, reduce terrain contrast locally only through general style rules; M |
| S05 | Dense but controlled label distribution across geographic classes | Our overview is peak/POI heavy, with large unlabeled hydro and contour fields | Fair candidate scheduling, class-aware priorities and measurable coverage; M–L |
| S06 | Muted olive/brown contours subordinate to labels and boundaries | Our strongly shaded slopes and contours dominate some views; reference is better for scanning names | Tunable neutral relief/contour contrast and density by ground scale; M |
| S07 | Index contours and elevation annotations explain terrain numerically | We have index weights and 611 contour-label candidates, but candidate count is not visible coverage | Ensure index coverage and useful elevation repeats before additional minor labels; M–L with S05 |
| S08 | Vegetation patches are distinct from bare terrain | Our elevation-based tint is not a vegetation map; reference's land-cover meaning is superior | Independent generalized land-cover fill over neutral terrain, with optional elevation tint; M after data adapter |
| S09 | Blue hydrography distinguishes watercourses from land and includes broken lines | Our 589 `intermittent=yes` ways are painted without that distinction | Persistent/intermittent/unknown styles; widths by feature attributes, not names; S–M |
| S10 | River shapes, islands and narrower tributaries form a hierarchy | We already have river-area polygons/islands, but a special Colorado/Bright Angel width rule | Polygon-first water with generic centerline fallback, river/stream hierarchy and lake fills; M |
| S11 | Road casing, widths and route shields distinguish network classes | Major/minor collapse and missing road labels obscure access; reference superior | Importance + surface + access rules; road-name repetition and `ref` shields; M–L |
| S12 | Minor roads/tracks are visibly different from foot trails | Only two named 4WD routes are specially selected; other distinctions are lost | Attribute-driven track styles; keep track firmness separate from motor access; M |
| S13 | Consistent trail linework with route/distance annotation | Our red corridor highlight is clearer for that trip, but four local classes are not portable | Base pedestrian trail style plus independent difficulty/access/network overlays; M |
| S14 | Management boundaries are unmistakably different from transport | No comparable boundary layer; missing semantic distinction | Dedicated boundary strokes/bands, hierarchy and edge labels; M |
| S15 | Backcountry area codes and regional names give hierarchy at broad scales | Curated plateau/rim names lack the reference's administrative structure | Polygon labels, interior-anchor selection and code badges; M |
| S16 | Compact, consistent amenity pictograms and clusters | Our custom subset works, but lacks many service categories and cluster consistency | Shared public icon vocabulary, measured facility groups and zoom-dependent grouping; M |
| S17 | Trail mileage appears next to route segments/junctions | Our mileage tables are useful but require looking away from the map | Graph-derived segment distance labels with reserved anchors and units; M–L |
| S18 | Small road numbers and long-distance trail emblems orient the reader | Missing road shields/route badges | Generic shield families keyed by network/ref metadata; M |
| S19 | Detailed settlement inset enlarges dense visitor-service areas | Zoom helps ours, but missing streets/services stay missing; no overview locator inset | Generate inset/detail panel from the same feature scene; M after data coverage |
| S20 | Latitude/longitude and UTM grid, edge ticks and indexes | Cursor coordinates only; grid/reference function missing | Projection-aware optional grid and neatline annotation with collision handling; M |
| S21 | Compass/declination information and scalebars | North arrow and overview scalebar exist, but scale disappears on zoom | Live metric/imperial scalebar; optional dated declination graphic for static output; S–M |
| S22 | Map-margin information and zone table are integrated with the sheet | We have page legends/tables/profile; reference better for management lookup, ours better for corridor elevation planning | Generate legends and supplemental tables from active layers; M |
| S23 | Light-theme palette separates vegetation, water, roads and jurisdictions | Our palette emphasizes canyon terrain and selected trails; no comparable jurisdiction colors | Shared semantic palette, color/line-pattern redundancy, light/dark checks; M |
| S24 | Print sheet has extensive context without interactive controls over it | Our cartouche/controls occupy useful corners, but offer search/layers and live coordinates | Compact/hideable controls and a separate static composition; S–M, not a reason to copy print UI |
| S25 | Fine mapped geometry remains coherent with text and symbols | Our terrain can expose source smoothing/resolution at high zoom; reference is more uniformly generalized | Ground-resolution-aware detail and topology-preserving simplification; L if changing terrain pipeline |

The reference is **not unconditionally superior** in hillshade readability, selected-route
emphasis, dark-mode support, search, layer toggles, URL sharing, elevation cursor or the
corridor profile. Preserve those strengths. Its extremely small printed labels are not
a model for screen font sizes. Do not copy a proprietary font/icon set or trace its raster.

## Content differences and how to close them

“Absent” refers to a missing general layer or rendering capability. “Partial” means we
already have some examples. Not every extra reference feature lies inside our frame.

| ID | Content in the reference | Current gap and confidence | General source / generation path; effort |
|---|---|---|---|
| C01 | Broader northern/eastern/southern geographic coverage | Outside-frame, not renderer loss: Saddle Mountain, much of eastern river corridor, Desert View and Tusayan area | Configurable AOI + buffer and identical provider queries; M plumbing, increased data/build cost |
| C02 | A fuller network of minor roads, access roads and local streets | Partial; road fetch/select rules omit many types and named cached roads | All relevant OSM highway ways and complete relations by area; generic scale filtering; M |
| C03 | Road names and state/forest-road numbers | Absent as systematic map labels despite 38 cached ways with `ref` | Preserve name/ref/network; normalize multiple references and generate shields; M |
| C04 | Unnamed connectors, pedestrian access and small trail branches | Partial; first fetch requires names and supplemental fetch uses local boxes/name regexes | Area-wide path/footway/steps/bridleway/cycleway acquisition; retain unnamed geometry; M |
| C05 | Named and numbered long-distance route membership | Partial selected trail names; no complete route-membership system | Complete OSM hiking/foot route relations plus agency trail attributes; M–L |
| C06 | Road/trail surface, track quality and access distinctions | Cached but mostly discarded; exact reference legend unavailable | Preserve separate OSM/agency fields and render only supported distinctions; M |
| C07 | Bridges, tunnels, crossings and barriers | Partial: three bridge symbols plus curated tunnel; no general crossing/barrier handling | OSM bridge/tunnel/ford/barrier topology and agency data; M |
| C08 | Segment mileage along trails | Main corridor tables exist; no systematic on-map segment mileage | Metric trail graph, junction-to-junction distance and explicit authoritative overrides as sourced data; M–L |
| C09 | Numerous named waterways | Missing names and failed labels; confirmed cached examples include Bright Angel Creek, Phantom Creek and Wall Creek | Repair runtime first; add USGS hydrography + GNIS linkage; M–L per component |
| C10 | Washes and tributaries deliberately removed in our code | Nine names affected: Bright Angel Wash, Coconino Wash, Kwagunt, Lava, Milk, Ninetyfour Mile, Ninetyone Mile, Tuna and Unkar creeks | Remove substring exclusions; filter only by class, scale, geometry and data quality; S after shared model |
| C11 | Intermittent/seasonal hydrography | 589 cached ways explicitly intermittent; rendering ignores it | OSM intermittency/seasonality plus provider-specific hydro attributes; S–M |
| C12 | Lakes, ponds, reservoirs and wetlands | Generic acquisition absent: `fetch_water.py` requests river areas only | OSM multipolygons + USGS waterbodies; wetlands from suitable hydro/land-cover sources; M–L; especially relevant in Sequoia |
| C13 | Springs, waterfalls and other water landmarks | Partial: 39 spring nodes cached versus four spring symbols; one falls symbol (Ribbon Falls), no Cheyava Falls annotation | General natural-feature catalog from OSM, GNIS and agency public data; deduplicate by identity/location/type; M |
| C14 | Rapids, river distances and river landmarks | A few rapids are labeled; no systematic river-mile framework | Named feature sources plus authoritative river-route stationing where available; M–L; river mile origin cannot be guessed |
| C15 | Names for canyons, valleys, ridges, mesas, points, saddles and basins | Some curated regions and OSM named peaks; broader gazetteer absent | GNIS + OSM + agency names; point anchors first, axes/polygons when supported; M–L |
| C16 | More spot elevations and terrain reference points | Partial: 57 peak symbols/labels; 108 peak nodes cached includes unnamed nodes, so difference is not 51 missing names | Named-point inventory and sampled DEM elevations with provenance; M; distinguish source elevation from DEM estimate |
| C17 | Forest/meadow/shrub/bare-area patterns | No independently sourced land-cover layer | Annual NLCD general backdrop; agency vegetation polygons for finer meaning; M–L |
| C18 | Park, national forest, wilderness and reservation boundaries | No general administrative/ownership polygons or labels | PAD-US and appropriate agency/tribal/federal boundary sources; retain designation/ownership distinctions; M–L |
| C19 | Private/inholding boundaries or access distinctions | No systematic layer; cannot infer access from land-cover color | Relevant public tenure and access data; overlap-aware rendering and source dates; M–L, availability varies |
| C20 | Backcountry use-area boundaries and alphanumeric codes | Absent; our trail “zone” classes do not substitute for polygon management units | Agency management polygons and public area tables through a provider adapter; M–L if GIS exists, larger if only PDFs |
| C21 | Backcountry area lookup/camping classifications | Absent table; our trail/stop tables have a different purpose | Join area IDs to sourced management metadata and render a generic legend/table; M + O |
| C22 | Campgrounds, trailheads, viewpoints, ranger stations, lodges and shelters | Partial curated inventory; not all acquired POIs are cataloged | OSM/agency POI catalog, stable IDs, category priorities and facility grouping; M–L |
| C23 | Toilets, parking, picnic areas, information, food, shops/fuel, phones and other visitor services | Most service categories absent or incidental prose; exact identities of some tiny pictograms uncertain | Broader OSM amenity/tourism queries and public agency facility inventories; shared icons; M–L + freshness review |
| C24 | Drinking-water points differentiated from natural sources | Six water symbols and textual notes exist, but coverage/freshness not systematic | Preserve potable/source type and dated availability separately; OSM/agency facility data; M + O |
| C25 | Settlement buildings, local access and service arrangement in South Rim inset | No systematic building layer or generated inset | OSM building/landuse/streets + facility inventory; scale-controlled scene and inset; M–L |
| C26 | Transport infrastructure and visitor access context | No general rail/shuttle/stop/parking network; some detail is only in page notes | OSM transport infrastructure and agency route/stop data; seasonal service as separate dated metadata; M–L |
| C27 | Historic/cultural landmarks and publicly mapped visitor sites | Very limited; not a general category | Public OSM tourism/historic and agency visitor-site inventories; no invented or inferred site locations; M |
| C28 | Coordinate grid, datum/projection reference and neatline indexes | Absent grid and sheet referencing | Derive from map projection/AOI with automatic edge labels; M |
| C29 | Declination compass and scale information | Partial compass/overview scale only | Offline dated NOAA WMM calculation plus projection-aware scalebar; M |
| C30 | No-flight-zone annotation/boundaries | Visible in reference, absent here; optional context for a hiking product | Dedicated authoritative airspace provider if wanted; M–L + O. Do not treat yellow lines as trail styling |
| C31 | Printed contact, interpretive and outdoor-ethics panels | Ours has sources/use notes and hiking notes, but different editorial content | Configurable generated information panels with dated source links; S–M + O |
| C32 | Regional context/detail inset and adjoining-sheet cues | Edge arrows exist; no automatic locator/detail inset | AOI-derived overview and named connected-feature edge pointers; M |

Some maroon/brown sinuous lines in the reference are management-area boundaries,
not additional trails. Yellow lines have mixed or uncertain meanings without the full
legend. Where the image explicitly says “No Flight Zone,” that is a different layer
from roads or hiking routes. This distinction is essential to a fair inventory.

## Reusable data sources and limitations

| Source | What it can fill | Implementation and limits |
|---|---|---|
| [OSM surface](https://wiki.openstreetmap.org/wiki/Key:surface), [tracktype](https://wiki.openstreetmap.org/wiki/Key:tracktype), [sac_scale](https://wiki.openstreetmap.org/wiki/Key:sac_scale) | Physical route attributes already partly present | Keep original tags and normalized fields. Tracktype concerns track firmness/improvement; SAC concerns hiking difficulty, while trail visibility is separate. Missing tags do not establish an easy, passable or public route. |
| [OSM intermittency](https://wiki.openstreetmap.org/wiki/Intermittent) | Broken-line hydro styling | Intermittency and seasonality are distinct attributes. Neither line appearance nor a missing tag establishes current flow or potable water. |
| [USGS 3DHP and legacy hydrography access](https://www.usgs.gov/3d-hydrography-program/access-3dhp-data-products) | Flowlines, waterbodies and network context | Prefer a versioned 3DHP extraction where suitable; inspect coverage. Legacy NHD remains available but is no longer maintained. Do not assume the whole AOI has new elevation-derived mapping. |
| [3DHP flowline schema](https://www.usgs.gov/ngp-standards-and-specifications/3d-hydrography-program-3dhpall-flowline) | Hydro name linkage and chain identity | Use `gnisid` for name lookup and `mainstemid` for network context. `id3dhp` is explicitly nonpersistent: retain dataset version. Avoid blindly assigning the nearest GNIS point to a stream. |
| [GNIS downloads](https://www.usgs.gov/us-board-on-geographic-names/download-gnis-data) | Natural-feature/place names and variants | TXT/GPKG/GDB available. Natural-feature names are useful; points do not define entire ridge/canyon footprints. Administrative features in the 2021 archive are unmaintained, not a current general POI source. |
| [USFS national geodata](https://data.fs.usda.gov/geodata/edw/datasets.php) | Forest roads, trails and administrative data | Adapter to common fields with source dates; availability and attributes vary. A road geometry dataset is not automatically a current motor-use authorization map. |
| [NPS GIS/maps](https://www.nps.gov/subjects/gisandmapping/nps-maps.htm) | Agency trail/facility/boundary data and public symbols | Discover datasets by area/provider metadata. Use reusable public map symbols; do not recreate the proprietary reference's exact icon art. |
| [PAD-US](https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-download) | Protected-area context and designations | Preserve overlapping fee/designation/easement/proclamation layers; do not collapse every polygon into ownership or wilderness. |
| [Annual NLCD](https://www.usgs.gov/centers/eros/science/usgs-eros-archive-land-cover-annual-nlcd-collection-1-land-cover) | General vegetation/land-cover backdrop in both parks | CONUS 30 m, 16 classes; Collection 1.2 adds 2025. Generalize for display; it cannot identify individual sequoias or precise grove boundaries. |
| [NOAA WMM](https://www.ncei.noaa.gov/products/world-magnetic-model) | Dated declination | Compute for AOI/date, rather than copying the reference's compass angle. Optional for the interactive product, useful for a print sheet. |

Provider-specific mappings are reasonable; **region-name tests in rendering code are not**.
An agency's “developed trail class” should remain its own attribute, not be silently
converted into OSM hiking difficulty. Name conflicts and uncertain geometry matches
need recorded provenance and a review queue, not hidden overrides.

A concrete portability check exists: the official [Sequoia/Kings Canyon Park Atlas
metadata](https://irma.nps.gov/DataStore/DownloadFile/526466) describes trails with
management classes, bridges, food-storage boxes, wilderness travel zones, groves,
wet meadows and named trees. This verifies that the same feature model needs more
than Grand Canyon's four trail categories. However, that document is explicitly
**August 2015**; it is discovery evidence, not current conditions or a validated fresh
Sequoia dataset. A current source/coverage audit is a plan task. Likewise, the
[Grand Canyon trail GIS catalog](https://catalog.data.gov/dataset/grand-canyon-national-park-trail-gis-dataset)
points to an older dataset: a recently crawled catalog is not proof of recently
surveyed trails. [NPS use-area information](https://www.nps.gov/grca/planyourvisit/campsite-information.htm)
can guide a management-data adapter without hard-coding its codes into the renderer.

## Architecture that works in both parks

1. **Map specification:** AOI, metric working CRS, units, output dimensions, source
   selection, theme and detail profile. No embedded Grand Canyon coordinates in
   fetch/render functions. Adopt this by deliberately updating consumers of the
   [data contract](specs/map-data.md), not by silently changing coordinate units.
2. **Versioned source catalog:** provider, source ID/version, retrieval date, extent,
   attribution, original attributes and quality flags. Acquire complete intersecting
   ways/relations with an AOI buffer, then clip. Offline cached builds stay offline.
3. **Common feature model:** road/trail segment identity, route membership, physical
   attributes, access, management designation, hydro attributes, named points/areas,
   facilities and boundaries. Preserve segment changes and disconnected components;
   grouping by name alone is not identity or connectivity.
4. **Semantic rules:** class/importance/ground scale determine visibility, ink and
   label priority. Ground scale means meters per CSS pixel, not “6×” of a region's
   arbitrarily chosen overview. Both builders consume the same decisions while
   retaining distinct print and interactive compositions.
5. **Label pipeline:** separate source absence, filtered geometry, no name, no
   candidate, invalid metrics, collision, outside view, budget deferral and painted
   outcomes. Process visible relevant chains first, generate stable candidates,
   continue unfinished preparation while idle, and never let an optional class
   starve forever. Pan translates accepted layouts; zoom may recompute them.
6. **Delivery:** materialize source joins, projections, indexes and generalized
   geometry during map generation. Embed only the selected scene, fonts and needed
   metadata. Larger source catalogs must not become a larger synchronous startup job.

The terrain tint deserves explicit generalization: our canyon elevation bands are an
editorial approximation, not geology polygons. A Sequoia map must not reuse “above
7,500 ft means forest” or Grand Canyon stratigraphic colors as if they were universal.
Use a neutral relief default plus actual land cover; optionally support sourced geology
as a separate future layer.

## Priority, expected benefit and remaining uncertainty

| Priority | Work | Expected benefit | Rough effort |
|---|---|---|---|
| 1 | Explain/fix line-candidate failures and resumable label preparation; remove `?` labels | Makes already available water/trail/contour names usable; no honest percentage until placement failures are classified | 3–6 days |
| 1 | Readability profile and screen-scale hierarchy | Immediately larger, clearer deep-zoom text; proposed 12→15 px is 25% larger type, not 25% more readable by measurement | 1–3 days plus collision/interaction QA |
| 2 | Common feature model, area acquisition and attribute-driven route styles | Recovers useful distinctions from hundreds of already tagged segments; removes local allowlists | 1–2 weeks |
| 2 | USGS hydro/GNIS names and repeat placement | Adds names beyond OSM and fills viewport gaps; gain unknown until spatial join/coverage audit | 4–8 days after common model |
| 3 | General POIs, road labels/shields, segment distances | Much better visitor access and route planning context | 4–8 days after common model |
| 3 | Land cover and boundaries | Largest visual/content step toward reference's contextual richness | 4–8 days after adapters |
| 4 | Grid, live scale, insets and management tables | Completes print/navigation context | 3–7 days; management data review additional |
| Separate | Startup pipeline beyond Canvas | Required if the original ≥3× initial-responsiveness target remains the goal | Measure parse/decode/measurement first; no credible 3× estimate yet |

A useful portable first release is plausibly **several weeks of engineering**, with
visible improvements delivered incrementally. Full parity including fresh management
rules, all facilities, fine landform names and polished print composition is an ongoing
mapping product. Reuse national datasets and provider adapters; do not make manual
per-region transcription the core workflow.

The Canvas benchmark already yields about 3.1× lower continuous-zoom CPU time and
3.1× lower CPU time for panning at 14× view; optional WebGL yields 4.8× lower zoom CPU
than the preceding SVG/hybrid baseline. Neither achieved 3× startup responsiveness.
See [the exact measurements and limits](PERFORMANCE.md#persistent-canvas-and-webgl-contours--2026-09-09).
Adding labels/data must preserve those gains through preprocessing, culling and
cancellable preparation. A drawing speedup does not guarantee a comparable improvement
in font measurement, initial DOM parsing, or actual display frame rate.
