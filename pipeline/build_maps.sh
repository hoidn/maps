#!/usr/bin/env bash
# Rebuild candidates from local caches; performs no fetches and never promotes output/.
set -euo pipefail
pipeline_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(dirname "$pipeline_dir")"
selected=""
custom_spec=""
if (($#)); then
  if [[ $# != 2 || $1 != --map || -z $2 ]]; then
    printf 'Usage: %s [--map ID]\n' "$0" >&2
    exit 2
  fi
  selected="$2"
  if [[ -f "$selected" ]]; then custom_spec="$(realpath "$selected")"; fi
fi
map_python="${MAP_PYTHON:-python3}"
[[ -n "${MAP_PYTHON:-}" || ! -x "$repo_dir/.venv/bin/python" ]] || map_python="$repo_dir/.venv/bin/python"
cd "$pipeline_dir"
configured="$("$map_python" -c 'from map_spec import MapSpec; print("\n".join(MapSpec.configured_ids()))')"
mapfile -t maps <<< "$configured"
if [[ -n "$selected" ]]; then
 if [[ -n "$custom_spec" ]]; then
  selected="$("$map_python" -c 'from map_spec import MapSpec; import sys; print(MapSpec.load(sys.argv[1]).id)' "$custom_spec")"
 else
  found=false
  for id in "${maps[@]}"; do [[ $id != "$selected" ]] || found=true; done
  if [[ $found == false ]]; then
    printf 'Unknown map: %s\n' "$selected" >&2
    exit 2
  fi
 fi
  maps=("$selected")
fi
ready=()
for id in "${maps[@]}"; do
  inputs=("cache/$id/features.json" "cache/$id/dem.npy" "cache/$id/dem.json")
  if [[ $id == grand_canyon && -z "$custom_spec" ]]; then
    inputs=(cache/grand_canyon/features.json osm.json osm2.json dem.npy terrain.json dem_hi.npy terrain_hi.json)
  fi
  missing=()
  for file in "${inputs[@]}"; do [[ -f "$file" ]] || missing+=("$file"); done
  if ((${#missing[@]})); then
    if [[ -z "$selected" && $id != grand_canyon ]]; then
      printf 'Skipping uncached region %s: %s\n' "$id" "${missing[*]}"
      continue
    fi
    printf 'Missing cached build inputs: %s\n' "${missing[*]}" >&2
    if [[ $id == grand_canyon && -z "$custom_spec" ]]; then
      printf 'Run pipeline/run_all.sh to fetch and process the inputs first.\n' >&2
    else
      printf 'Run pipeline/fetch_region.py --map %q to fetch the regional inputs first.\n' "${custom_spec:-$id}" >&2
    fi
    exit 1
  fi
  ready+=("$id")
done
cd "$repo_dir"
node scripts/build-labels.mjs
export PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-$repo_dir/.browser-cache}"
for id in "${ready[@]}"; do
  cd "$pipeline_dir"
  if [[ $id == grand_canyon && -z "$custom_spec" ]]; then
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
    cd "$repo_dir"
    node scripts/finalize-static.mjs --input pipeline/grand_canyon_trails.html --output pipeline/grand_canyon_trails_final.html --report artifacts/layout/static-finalization
  else
    "$map_python" build_region.py --map "${custom_spec:-$id}" --renderer webgl
    "$map_python" build_region.py --map "${custom_spec:-$id}" --mode static
    cd "$repo_dir"
    node scripts/finalize-static.mjs --input "pipeline/${id}_trails_static.html" --output "pipeline/${id}_trails_static_final.html" --report "artifacts/layout/${id}-static-finalization"
  fi
done
