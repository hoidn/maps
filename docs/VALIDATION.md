# Validation guide

**Status:** Guidance for the current pipeline, 2026-09-08. Browser automation,
automatic collision checks, and verified promotion in the layout plan remain
proposals. This guide does not claim the delivered maps pass those future gates.

Select evidence for the requested change and affected
[data contracts](specs/map-data.md). A narrow fix does not require the entire
future layout release matrix. Report missing prerequisites or unchecked behavior
instead of treating a historical screenshot or a successful build as proof.

## Documentation-only changes

Run `git diff --check`, check changed local links and heading fragments, and
compare any documented current commands/interfaces against their source files.
Distinguish draft commands from installed tooling. Do not regenerate maps for
changes to prose alone.

## Build and delivery

Existing scripts run from `pipeline/`. Install dependencies there with
`python3 -m pip install -r requirements.txt` when needed. There is no current
root `package.json`, Node test harness, or `build_maps.sh`.

With the required intermediates present, rerun only affected stages:

```bash
cd pipeline
python3 build_static.py       # osm.json, osm2.json, terrain.json, dem.npy required
python3 build_interactive.py  # osm.json, osm2.json, terrain_hi.json, dem_hi.npy required
```

Terrain-processing changes also need `python3 process_dem.py` or
`python3 process_dem_hi.py` before the corresponding builder. Those processors
require their DEM NPY inputs. If inputs are missing and the task requires a
full data rebuild, `cd pipeline && ./run_all.sh` from the repository root fetches
live OSM/USGS data and rebuilds both candidates. Do not present this as an offline
test or assume freshly fetched inputs match the delivered edition.

Confirm the command exits successfully and writes the intended candidate, then
inspect that file using the checks below. When the task includes updating local
deliverables, copy the checked candidates according to the
[artifact mapping](specs/map-data.md#artifacts-and-ownership) and confirm the
destination bytes match, for example from the repository root:

```bash
cmp pipeline/grand_canyon_trails.html output/grand_canyon_trail_sheet_static.html
cmp pipeline/grand_canyon_trails_interactive.html output/grand_canyon_trail_explorer_interactive.html
```

Run the comparison for each output being replaced; exit status 0 means identical
bytes. These commands verify copying, not cartographic correctness. Existing
build scripts do not validate or promote outputs automatically.

## Geographic and terrain changes

Check array shape, units, orientation, geographic extent, and affected JSON fields
against the data contract. Include known points in narrow terrain where a shifted
grid would fail; broad trailhead samples alone previously missed misregistration.
Use an identified reference for geographic corrections.

With `osm.json`, `osm2.json`, and `dem.npy` available, run from `pipeline/`:

```bash
python3 osmdata.py
```

Inspect relevant chain counts, lengths, orientation, and endpoint elevations.
Missing or unexpectedly fragmented trails need investigation. This diagnostic
prints values; it does not assert correctness. For stop/table changes, verify
the stop's own coordinate and its along-route mileage separately. Compare both
outputs when changing shared geographic conventions or duplicated builder logic.

## Cartography and interaction

Serve the repository from its root with `python3 -m http.server 8765` and open the
affected candidate under `/pipeline/` or the delivered map under `/output/`.
The [process guide](PROCESS.md#4-check-the-render-once) also records a headless
screenshot command; its URL assumes `pipeline/` is the served root.

For affected visual elements, inspect both themes, overview and a dense zoomed
region, plus a narrow and wide viewport. Check text, symbols, clipping, anchors,
and readability against the [design guide](DESIGN.md). Screenshots support visual
inspection; they do not establish that every possible view is collision-free.

For interaction changes, exercise the affected controls and transitions: pan,
wheel/pinch zoom as supported by the test setup, layer toggles, place selection,
trail hover/pinning, reset, cursor readout, and reloading a copied view URL.
For zoom-dependent changes, include both sides of 1.02×, 2×, and 4.5× transitions
and the supported 1×–14× limits. Report which inputs/devices were actually tested;
a screenshot at the end of a gesture does not test its intermediate frames.

If behavior gets an automated regression test, use a small fixture that can fail
for the relevant defect and does not depend on live data. The
[draft layout plan](plans/2026-09-08-automatic-map-layout-plan.md) describes future
test tooling and release checks; do not run its commands as if they already exist.

## What to report

State the source/output files changed, checks actually performed and results,
whether source data were refreshed, and material limitations. Separate successful
generation, visual inspection, exercised interactions, and geographic validation.
Only claim automated collision coverage or performance thresholds when actual
checks establish them for a declared rendering profile.
