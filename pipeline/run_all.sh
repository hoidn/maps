#!/usr/bin/env bash
# Explicit full fetch/processing path. Writes candidates; never promotes output/.
set -euo pipefail
pipeline_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname "$pipeline_dir")"
map_python="${MAP_PYTHON:-python3}"
[[ -n "${MAP_PYTHON:-}" || ! -x "$repo_dir/.venv/bin/python" ]] || map_python="$repo_dir/.venv/bin/python"
cd "$pipeline_dir"
"$map_python" fetch_osm.py
"$map_python" fetch_osm2.py
"$map_python" fetch_water.py
for source in gnis usgs_hydro boundaries landcover; do
  "$map_python" fetch_region.py --map grand_canyon --source "$source"
done
"$map_python" fetch_dem.py
"$map_python" process_dem.py
"$map_python" fetch_dem_hi.py
"$map_python" process_dem_hi.py
MAP_PYTHON="$map_python" ./build_maps.sh
