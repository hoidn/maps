# Grand Canyon trail maps

Two hand-designed maps of the central Grand Canyon, rendered as self-contained HTML pages from
USGS elevation data and OpenStreetMap vector data, plus the pipeline that produced them so the
process can be repeated for another area or another interval.

| Output | What it is | Size |
|---|---|---|
| `output/grand_canyon_trail_sheet_static.html` | Print-style sheet: shaded relief, 250 ft contours, trails by NPS zone, campgrounds, mileage tables, rim-to-rim profile | 2.3 MB |
| `output/grand_canyon_trail_explorer_interactive.html` | Same sheet with pan/zoom, contour ladders that sharpen with zoom (250 → 100 → 50 ft), layer toggles, place finder, trail hover, cursor elevation, shareable view in the URL hash | 6.9 MB |

Both pages are single files: terrain images are embedded as base64 JPEG, contours as inline SVG
paths, and the only external requests are Google Fonts. They render in light and dark themes.

![static sheet](docs/preview_static_wide.png)
![interactive at 6x](docs/preview_interactive_zoom6x.png)

## Repeat the build

```bash
cd pipeline
pip install -r requirements.txt   # numpy, scipy, scikit-image, Pillow, tifffile, requests
./run_all.sh                       # ~5 minutes, ~120 MB of downloads
```

The scripts write intermediates and the two HTML files into `pipeline/`. Copy the HTML into
`output/` when you are happy with it. Intermediates are git-ignored; regenerate them.

## Read next

- `docs/PROCESS.md` — the pipeline step by step, with what each script does and produces
- `docs/DATA_SOURCES.md` — where the terrain and vector data come from, licences, request details
- `docs/DESIGN.md` — cartographic decisions: projection, palette, symbology, typography, labels
- `docs/PITFALLS.md` — the things that went wrong and how they were caught, so they are not repeated
- `docs/ADAPTING.md` — checklist for pointing the pipeline at a different area

## Layout

```
pipeline/   fetch_*.py, process_dem*.py, osmdata.py, build_static.py, build_interactive.py, run_all.sh
docs/       process notes and preview images
output/     the finished HTML maps
```
