# Automation roadmap: from one hand-finished sheet to a generator

How the current pipeline was actually run, what is automatic, and what would have to change
to produce sheets for arbitrary routes without a person in the loop.

## How the visual check was done here

After each build the page was served locally, screenshotted with headless Chrome, cropped
into regions, and inspected by the author (the model, in this case) for label collisions and
misplaced names. Two passes per map, about half a dozen fixes each. That check was:

- **not systematic** — a few crops at one zoom; dense clusters (Monument / Cedar Spring /
  Salt / Horn camps, the peaks around Phantom Ranch) got a glance, and some overlaps were
  seen and accepted;
- **not ground-truthed** — it confirms a name sits by its symbol, not that the symbol is in the
  right place (resthouses sit at exactly 1.5 and 3.0 mi along the OSM line, not at the
  buildings);
- **not repeatable** — placements are hard-coded offsets for this frame, font and zoom.

## Current automation level

| Component | Status | Notes |
|---|---|---|
| Frame from bbox or route extent | automatic | constants in one place per script |
| Terrain fetch, hillshade, tint, contours | automatic | any interval; minutes per frame |
| Trails, roads, water, summits, camps from OSM | automatic | needs a tag→class map per region |
| Distances, elevations, profiles, tables | automatic | |
| Page assembly, themes, interactive layer | automatic | |
| Sun-and-shade model | not built; pure computation once written | horizon shadowing on the DEM |
| Chain selection and orientation | hand-coded by name | derive from route line / OSM relations: ~1 week |
| Contour interval, label density, symbol size | hand-picked | rules from scale and relief roughness |
| Tint ramp | hand-tuned to canyon geology | generic ramp by elevation range + per-region library |
| Region and stream name positions | hand-set | |
| **Label placement** | **hand-placed offsets** | **the gate; see below** |
| Data quality checks | manual reading of chain summary | heuristics: ~days |
| Editorial content (water, permits, closures) | hand-written | no global source; content operation |
| Story of the sheet (route, frame, omissions) | human | stays human |
| Final look at flagship sheets | human | shrinks to hours |

Roughly 80% of the code and 20% of the judgement is automatic today.

## Automatic label placement (the gate)

Requirements:

1. Measure each label's box (font metrics or a headless-browser measurement pass).
2. Generate candidate positions per anchor (eight compass offsets for points; along-line
   windows for trails and streams, rotated to the local bearing, flipped to read upright).
3. Assign priorities: trailheads and corridor stops > campgrounds and water > peaks > region
   names > contour labels; corridor trail names > other trail names.
4. Resolve collisions by priority with a greedy pass, then simulated annealing over the
   remaining conflicts; drop the lowest-priority labels that still collide, never overlap.
5. Keep collision tests against line features too (a label should not cross a trail or the river).
6. Re-run per zoom tier for the interactive map (each tier has its own budget).

Estimate: two to four weeks for a version good enough for the generated tier. Print-grade
sheets keep a human pass on top.

## Automating the visual check

- **Geometric**: exact overlap detection on label and symbol boxes; zero-tolerance for the
  flagship tier, small tolerance for generated.
- **Aesthetic**: render, then a vision-model review (a Claude call with the image and a
  checklist: collisions, text over dense contours, names far from symbols, unreadable
  rotations) that flags sheets for a person. Same loop as was run by hand here, executed
  at scale so a person only opens the flagged ones.

## Data quality checks to build

- Trail missing, fragmented into many short chains, or tagged `construction` / `abandoned`.
- Chain length disagreeing with a published figure by more than ~5%.
- POIs far from any trail or on a road (viewpoint at the shuttle stop).
- Elevation sanity: trailheads near the top of the local range, river points at the bottom.
- DEM extent check (already in `fetch_dem_hi.py`).

## Order of work for a generator

1. Label placement, benchmarked against the hand-placed Grand Canyon sheet.
2. GPX-or-drawn-line → sheet generator (frame, chains, profile, tables) using it.
3. Sun-and-shade layer and time slider.
4. Data quality gates and the automated visual review.
5. Catalogue: top routes hand-finished, the rest generated and labelled as such.

One to two months for a competent no-touch generator on top of this repo; flagship sheets
then cost hours each instead of days.
