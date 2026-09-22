# Adapting the pipeline to another area

The shared regional builder generates standalone interactive and static maps from a
configured frame and registered source caches. Grand Canyon, Sequoia and San Gabriel
are examples. Follow the [complete fetch/build/print workflow](LAYOUT_VALIDATION.md#regional-builds-and-large-format-pdfs);
the [data contract](specs/map-data.md#portable-region-catalogs-2026-09-09) owns source formats,
coordinates, units and cache registration.

Start `npm run generate:map` with a title and selected longitude/latitude bounds, as shown
in the linked workflow. It derives the dimensions from central geodesic distances and
writes the generated specification into the ignored region cache. No source-code or
checked-in JSON edit is required. The checked-in specifications are presets; explicit
JSON-file inputs remain available for editorial requirements. Cached selection fails for
missing essential inputs rather than building another region. Reusing a configured ID with a
different frame is rejected; omit `--id` to derive a fresh cache ID from the title and bounds.

Use source-backed coordinates and required names/routes in that specification. An empty
required-route list is intentional and does not inherit Grand Canyon's trail requirements.
Do not compensate for missing coverage by moving labels or feature anchors. USGS providers
cover their supported US areas; another country needs suitable provider data before this
workflow can claim coverage there.

Acquisition is explicit. Review source dates, rejected features, missing providers, DEM
registration and terrain sampling before assessing the map. Check recognizable summits,
river junctions and access areas at matched ground scales. A successful build does not
establish current trail access or geographic accuracy.

Add source-backed scenes to `tests/fixtures/cartography-scenes.json`, with expected names
and painted geometry classes. The cartography audit rejects unknown maps, empty scenes
and missing expected content; unreviewed scenes remain pending. Run the selected region's
browser/backend fuzz matrix as described in the layout guide. Requested WebGL falling back
to Canvas does not count as a WebGL pass.

The authored Grand Canyon builders remain separate adapters for its historic trail
selections, stop tables, elevation profile and explanatory page. They receive their actual
specification through the shared cartography integration. Do not copy those builders or
change their geographic constants to add a region. The print composer reuses their SVG
while supplying physical typography and the shared collar; their available static contour
detail remains 250 ft.

Printing and candidate generation do not promote delivered maps. The Grand Canyon pair
still requires the existing [verified promotion gate](LAYOUT_VALIDATION.md#what-the-gates-establish).
