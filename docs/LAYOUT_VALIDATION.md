# Automatic map layout and release validation

The Python builders emit geographic anchors, stable annotation and feature IDs, path references,
priorities, required-name groups and declared word-preserving line breaks. The browser measures
the embedded fonts and rendered SVG geometry in CSS pixels. The placement solver reserves
space for controls and protected trail strokes, tries bounded alternatives, and records an
outcome for every annotation. Hiding optional labels is an explicit outcome; required static
names must remain visible. A symbol does not satisfy a name requirement.

The interactive controller owns camera, layer and label changes. The static finalizer bakes
positions into HTML at the declared 1300-unit map width and checks the serialized file again
with JavaScript disabled. This retains the existing SVG terrain, palettes and geographic data.
Regions receive bounded alternatives around their authored position; the system does not infer
region boundaries from a name or move geographic features to make labels fit.

## Setup and commands

Use Node 24, the pinned dependencies in `package-lock.json`, and the Python requirements.
Browser binaries live in the ignored `.browser-cache/` directory. The pinned Playwright version
supports the macOS version used for development; changing it requires rerunning the matrix.

```bash
npm ci
npm run browsers:install
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
npm run build:labels
npm run test:unit
.venv/bin/python -m unittest discover -s tests/python
npm run test:browser
```

`pipeline/run_all.sh` explicitly fetches and processes current OSM/USGS inputs. Once caches
exist, `npm run build:maps` performs a build without fetching. Missing caches are listed before
any build starts. `MAP_PYTHON` can select an existing Python environment. Both build routes
write candidates into `pipeline/`; neither replaces delivered maps.

```bash
npm run build:maps
npm run verify:maps
npm run promote:maps
```

The final command revalidates immutable candidate snapshots before replacing either file in
`output/`. Both candidates must pass, hashes must still match, and a failure replacing the
second file rolls the first back. This is local promotion only; hosted pages are not published.
Do not replace `output/` with manual copies that bypass the checks.

## What the gates establish

- Every rendered map label and symbol has manifest ownership. Unknown annotations fail.
- Rendered label footprints do not overlap one another, protected trails or controls, and
  respect the declared map edge. Typed local symbol-anchor relationships are the only
  geometric exceptions. Separate facilities at the same place still require separation.
- The static sheet retains all nine required corridor place names and one name for each of
  Bright Angel, South Kaibab and North Kaibab Trail. Missing required names fail finalization.
- Interactive layers, search, camera restoration, tier transitions and moving frames are
  checked in addition to settled views. Hidden directory features remain selectable.
- Frozen output is checked in Chromium, Firefox and WebKit, light and dark themes, without
  JavaScript or external font/network access. Font assets and OFL notices are checked in.
- Release scenes cover phone, tablet and desktop widths, DPR 1/2, fractional zoom boundaries,
  dense areas, seeded random states and paint-aligned gesture frames.
- Performance is measured separately from correctness, including rendering the real contour
  map. Draft targets are 8 ms p95 warm transaction work, 33 ms p95 frame interval and 100 ms
  settled-layout delay. An unmet target must be reported, not hidden by suppressing all labels.

Independent audit code lives under `tests/support/`; it remeasures final DOM geometry and
uses a separate pairwise reference. It does not accept the solver's success flag as proof.
The read-only legacy adapter remains available for comparing the original maps:

```bash
npm run audit -- --input output/grand_canyon_trail_sheet_static.html --mode managed --no-js --report artifacts/layout/static-audit
```

Reports under `artifacts/layout/` record artifact, font and policy hashes, browser versions,
view geometry, coverage, collisions, clipping and screenshots. Development reports are ignored
by Git; a release summary should record the tested artifact hashes and actual performance.
Tests of promotion deliberately fail audits, mutate candidates and simulate a second-file
replacement failure to verify that delivered bytes are preserved.

## Limits

A finite test matrix alone cannot prove behavior at every real-valued zoom. The synchronous
runtime validity check enforces the supported geometric rules for displayed states; randomized
and transition tests look for implementation defects. Browser font shaping, glyph bounds and
sampled curved paths require conservative envelopes and cross-engine verification.

Static validity applies at the declared natural map size and uniform scaling of the frozen
scene. Arbitrary responsive print reflow, new fonts, third-party CSS, different projections or
new annotation classes require new validation. Exact print/PDF glyph outlines are a separate
export feature. Human review remains useful for composition and geographic meaning; collision
checks cannot verify OSM positions, water availability, closures, route continuity or safety.
