# Validation guide

**Status:** Implementation active; **release validation pending**, 2026-09-08.
Python, Node, browser audits, static finalization, and verified local promotion are
implemented. This guide does not claim that the delivered maps pass the release
gates or that hosted artifacts have been updated.

Select evidence for the requested change and the affected [data](specs/map-data.md)
and [layout](specs/map-layout.md) contracts. A narrow fix needs focused evidence;
map promotion needs the complete release gate. Report missing prerequisites and
unchecked behavior rather than treating an old screenshot or build as proof.
The [layout operations guide](LAYOUT_VALIDATION.md) owns setup, commands, profiles,
and operational limits.

## Documentation-only changes

Run `git diff --check`, check changed local links and heading fragments, and
compare any documented current commands/interfaces against their source files.
Distinguish draft commands from installed tooling. Do not regenerate maps for
changes to prose alone.

## Build and delivery

Use the root commands in the [layout operations guide](LAYOUT_VALIDATION.md#setup-and-commands).
The cached build entry point checks required intermediates, bundles the engine,
runs both Python builders, and finalizes the static staging file. It makes no
source-data fetches. The full build explicitly fetches and processes OSM/USGS
inputs first; fresh data may differ from the delivered edition.

Individual Python stages still run from `pipeline/`; processors require their
DEM NPY inputs, and builders require processed terrain, OSM inputs, and the layout
bundle. Rebuilding a static generator alone produces runtime-dependent staging
HTML, not the final static delivery artifact. Use the
[artifact mapping](specs/map-data.md#artifacts-and-ownership) and
[frozen-static contract](specs/map-layout.md#frozen-static-artifact).

Static finalization reopens serialized bytes without JavaScript or external
network access in the supported browser/theme matrix. Pair verification also
checks interactive release scenes, reviewed coverage, and real-map performance.
Promotion verifies immutable snapshots, checks their hashes again, and rolls back
a prior replacement if the later replacement fails. Do not bypass the gate with
manual copies or interpret one successful fixture as approval of the real maps.
Hosted publication remains a separate action.

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

Serve the repository from its root with
`python3 -m http.server 8765 --bind 127.0.0.1` and open the
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

Use the checked-in Python, Node, and Playwright suites for behavior regressions.
A small fixture should fail for the defect and work without live data. Independent
managed audits remeasure rendered geometry rather than trusting solver diagnostics;
legacy reports preserve original findings and are not a release allowlist.

Follow [layout operations](LAYOUT_VALIDATION.md#what-the-gates-establish) for the
complete release checks. Confirm the scene configuration's coverage review is
frozen and the reports refer to the exact candidate hashes. Paint-aligned automated
frames supplement the runtime's synchronous checks; they are finite test evidence,
not a mathematical proof over every zoom or a substitute for real-device testing.

## What to report

State the source/output files changed, checks actually performed and results,
whether source data were refreshed, and material limitations. Separate successful
generation, visual inspection, exercised interactions, and geographic validation.
Only claim automated collision coverage or performance thresholds when actual
checks establish them for a declared rendering profile.
