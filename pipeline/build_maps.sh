#!/usr/bin/env bash
# Rebuild candidates from local caches; performs no fetches and never promotes output/.
set -euo pipefail
pipeline_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname "$pipeline_dir")"
cd "$pipeline_dir"
missing=()
for file in cache/grand_canyon/features.json osm.json osm2.json dem.npy terrain.json dem_hi.npy terrain_hi.json; do
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
if ! "$map_python" -c 'import json; from path_geometry import GEOMETRY_VERSION; from contour_smoothing import SMOOTHING_VERSION; d=json.load(open("terrain_hi.json")); raise SystemExit(d.get("geometryVersion") != GEOMETRY_VERSION or bool(d.get("smoothing")) and d["smoothing"].get("version") != SMOOTHING_VERSION)'; then
  "$map_python" process_dem_hi.py
fi
# Refresh stale shading without re-extracting or re-smoothing contour geometry.
for suffix in "" "_hi"; do
  if ! "$map_python" -c 'import json,sys; from hillshade import HILLSHADE_VERSION; raise SystemExit(json.load(open(sys.argv[1])).get("hillshadeVersion") != HILLSHADE_VERSION)' "terrain${suffix}.json"; then
    "$map_python" "process_dem${suffix}.py" --shading-only
  fi
done
"$map_python" smooth_terrain.py --cache terrain.json --dem dem.npy --register-only
"$map_python" smooth_terrain.py
"$map_python" build_static.py
"$map_python" build_interactive.py --renderer webgl
"$map_python" build_interactive.py --renderer canvas --output grand_canyon_trails_canvas.html
if [[ -f cache/sequoia/features.json && -f cache/sequoia/dem.json ]]; then
  "$map_python" build_region.py --map sequoia --renderer webgl
fi
cd "$repo_dir"
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$repo_dir/.browser-cache}"
node scripts/finalize-static.mjs --input pipeline/grand_canyon_trails.html --output pipeline/grand_canyon_trails_final.html --report artifacts/layout/static-finalization
