#!/usr/bin/env bash
# Rebuild both maps from scratch. Run from the pipeline/ directory. ~5 min, ~120 MB of downloads.
set -euo pipefail
python3 fetch_osm.py          # osm.json  : named trails, streams, roads, POIs
python3 fetch_osm2.py         # osm2.json : route relations + corridor paths (incl. construction-tagged North Kaibab)
python3 fetch_dem.py          # dem.npy   : 2600x1729 USGS 3DEP grid for the static sheet
python3 process_dem.py        # terrain.json : hillshade JPEGs + 250 ft contours
python3 build_static.py       # grand_canyon_trails.html
python3 fetch_dem_hi.py       # dem_hi.npy : 3900x2592 grid for the interactive map
python3 process_dem_hi.py     # terrain_hi.json : hillshade + 250/100/50 ft contour ladders
python3 build_interactive.py  # grand_canyon_trails_interactive.html
