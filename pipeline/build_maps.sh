#!/usr/bin/env bash
# Rebuild candidates from local caches; performs no fetches and never promotes output/.
set -euo pipefail
pipeline_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname "$pipeline_dir")"
cd "$pipeline_dir"
missing=()
for file in osm.json osm2.json dem.npy terrain.json dem_hi.npy terrain_hi.json; do
  [[ -f "$file" ]] || missing+=("$file")
done
if ((${#missing[@]})); then
  printf 'Missing cached build inputs: %s\n' "${missing[*]}" >&2
  printf 'Run pipeline/run_all.sh to fetch and process the inputs first.\n' >&2
  exit 1
fi
map_python="${MAP_PYTHON:-python3}"
[[ -n "${MAP_PYTHON:-}" || ! -x "$repo_dir/.venv/bin/python" ]] || map_python="$repo_dir/.venv/bin/python"
cd "$repo_dir"
node scripts/build-labels.mjs
cd "$pipeline_dir"
# Old terrain caches have already discarded vertices. Re-extract from the local
# DEM once when the interactive geometry format changes; never fetch here.
if ! "$map_python" -c 'import json; from path_geometry import GEOMETRY_VERSION; raise SystemExit(json.load(open("terrain_hi.json")).get("geometryVersion") != GEOMETRY_VERSION)'; then
  "$map_python" process_dem_hi.py
fi
"$map_python" build_static.py
"$map_python" build_interactive.py
cd "$repo_dir"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$repo_dir/.browser-cache}"
node scripts/finalize-static.mjs --input pipeline/grand_canyon_trails.html --output pipeline/grand_canyon_trails_final.html --report artifacts/layout/static-finalization
