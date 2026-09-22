# Grand Canyon trail maps

Two authored Grand Canyon deliverables, plus a shared regional generator configured for
Grand Canyon, Sequoia and the San Gabriel Mountains. It produces standalone HTML from USGS
terrain and OpenStreetMap geometry, and large-format PDFs with a printed map collar.

| Output | What it is | Size |
|---|---|---|
| `output/grand_canyon_trail_sheet_static.html` | Print-style sheet: shaded relief, 250 ft contours, trails by NPS zone, campgrounds, mileage tables, rim-to-rim profile | 2.3 MB |
| `output/grand_canyon_trail_explorer_interactive.html` | Same sheet with pan/zoom, contour ladders that sharpen with zoom (250 → 100 → 50 ft), layer toggles, place finder, trail hover, cursor elevation, shareable view in the URL hash | 6.9 MB |

Both pages are single files: terrain images are embedded as base64 JPEG, contours as inline SVG
paths, and fonts are embedded from checked-in, licensed assets. They render in light and dark themes.

![static sheet](docs/preview_static_wide.png)
![interactive at 6x](docs/preview_interactive_zoom6x.png)

## Repeat the build

```bash
npm ci
npm run browsers:install
python3 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
./pipeline/run_all.sh          # explicit fetch + process + candidate build
npm run build:maps             # subsequent builds from local caches
npm run verify:maps            # independent audits, scenes and performance
npm run promote:maps           # revalidate and replace both local output files
```

See [layout validation](docs/LAYOUT_VALIDATION.md) for checks, reports, required coverage and
supported layout limits. The cached build selects WebGL contours with Canvas relief and
foreground cartography, emits a Canvas companion, and discovers other configured regions
whose essential source and DEM caches exist. Select one with `npm run build:maps -- --map san_gabriel`.
The [backend guide](docs/RENDERING_BACKENDS.md)
describes renderer selection, fallback and fidelity limits. Builds write candidates into
`pipeline/`; promotion preserves the existing outputs if a check fails. Intermediates and
browser caches are Git-ignored.

Portable source providers, region-specific `MapSpec` data and shared cartography are installed
for all three regions: geographic names, hydrography, protected areas, land cover,
transport and facilities feed the same rendering and label preparation. Candidate validation
and promotion remain pending; the delivered files and previews above represent the earlier
edition. The [portable cartography plan](docs/plans/2026-09-09-portable-cartography.md)
tracks implementation and validation, while the [startup investigation](docs/STARTUP_INVESTIGATION.md)
tracks the still-unproven 3× initial-responsiveness target.

Generate any selected area without editing a region file:

```bash
npm run generate:map -- --title "San Gabriel Mountains" --bbox=-118.45,34.10,-117.42,34.55 --id san_gabriel
```

This derives the specification, fetches sources, builds HTML and exports the PDF. Use
`--cached` for subsequent runs without fetching. The optional ID names its cache; otherwise
the command derives one from the title and bounds. The three checked-in specs are presets.

Print an existing cache with `npm run print:map -- --map san_gabriel --paper 36x24in`.
Use `--scale 50000` to derive a sheet at nominal 1:50,000, or combine paper and scale to
require a fit. The PDF includes its matching legend, coordinates, north arrow, dual scale
bars, contour interval, source dates and a 100 mm calibration bar. Fonts and linework remain
vector; terrain quality depends on source sampling. Follow the complete
[regional build and print workflow](docs/LAYOUT_VALIDATION.md#regional-builds-and-large-format-pdfs)
for acquisition, prerequisites and inspection. The
[execution record](docs/plans/2026-09-22-regional-generation-and-print-plan.md)
distinguishes tested fixtures from real-map acceptance.

## Read next

- [Documentation index](docs/index.md) — routes by task to contracts, guides, plans and historical context
- [Agent working rules](AGENTS.md) — scope, document authority, source/output ownership and evidence expectations
- [Process](docs/PROCESS.md), [validation](docs/VALIDATION.md) and [layout validation](docs/LAYOUT_VALIDATION.md) — build stages and automated release checks

The automatic-layout implementation follows the [design and plan](docs/plans/2026-09-08-automatic-map-layout-design.md);
release evidence determines whether candidate maps may replace the delivered edition.
Lidar delivery remains a proposal. [HANDOFF.md](HANDOFF.md) records the original session.


## Layout

```
pipeline/   fetch_*.py, process_dem*.py, osmdata.py, build_static.py, build_interactive.py, run_all.sh
docs/       task index, contracts, guides, plans and preview images
output/     the finished HTML maps
```
