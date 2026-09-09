# Data sources

**Role:** Acquisition and reference notes for the dated source snapshots below.
Conditions, service behavior, and catalogue coverage are not live-verified here.
The [data contract](specs/map-data.md) owns pipeline formats and units; use the
[index](index.md) to find current implementation and proposed work.

## Terrain: USGS 3D Elevation Program (3DEP)

- **Service**: `https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage`
- **Product**: seamless ⅓-arc-second DEM (about 10 m cells) for the conterminous US; the
  ImageServer resamples on the fly to whatever pixel grid you ask for.
- **Datum**: horizontal WGS84/NAD83 (EPSG 4326 in the request); vertical NAVD88, metres.
  Multiply by 3.28084 for feet.
- **Licence**: public domain (US Government work). Credit "U.S. Geological Survey 3D Elevation Program".
- **Request used** (static):

  ```
  bbox=-112.262,35.990,-111.898,36.232  bboxSR=4326  imageSR=4326
  size=2600,1729  format=tiff  pixelType=F32
  interpolation=RSP_BilinearInterpolation  noDataInterpretation=esriNoDataMatchAny  f=image
  ```

  Interactive: `size=3900,2592`, `f=json`, then download the returned `href`.

- **Limits observed**: `f=image` returned HTTP 500 at 3900×2593; `f=json` at the same size
  worked and served a 43 MB GeoTIFF via a temporary URL. The service snaps the extent to
  square pixels in degrees; a request whose `size` does not match the bbox aspect gets a
  larger bbox back (documented in PITFALLS.md).
- **Verification points** (published elevations, feet): Phantom Ranch 2,546; Bright Angel
  Trailhead 6,860; South Kaibab Trailhead 7,260; North Kaibab Trailhead 8,241; Cottonwood
  Campground 4,080; Supai Tunnel 6,800; Havasupai Gardens 3,800. The grid read within 60 ft
  of every one of these once the extent bug was fixed.
- **Fetched**: 2026-09-06.

### Finer terrain: 3DEP 1 m lidar DEMs

Not used by the current maps, but available over the whole frame and catalogued in
`pipeline/tiles_1m.json` (33 tiles, 4.8 GB, six projects; the 2019 Grand Canyon NP flight is the
one covering the inner canyon). Found through The National Map access API:

```
https://tnmaccess.nationalmap.gov/api/v1/products?datasets=Digital Elevation Model (DEM) 1 meter&bbox=...
```

`pipeline/fetch_dem_1m.py` lists and downloads them. Tiles are UTM 12N GeoTIFFs and need
reprojection to the sheet frame (GDAL or rasterio). See `HIGH_RES.md` for the plan and the size
arithmetic. The 3DEP ImageServer used by `fetch_dem.py` also serves this lidar data for a small
enough bbox, which is the cheap path for a single high-resolution inset.

## Vector data: OpenStreetMap

- **Service**: Overpass API, `https://overpass-api.de/api/interpreter` (fallback
  `https://overpass.kumi.systems/api/interpreter`, which rate-limited with 429 on first try).
- **Licence**: Open Database Licence (ODbL). Credit "© OpenStreetMap contributors". A derived
  map must carry that attribution, which the page footer does.
- **What was taken**: named `highway=path|footway|track|steps|bridleway` ways; `waterway=river|stream`;
  `highway=primary…residential`; nodes tagged `natural=peak|saddle|spring|arch`,
  `tourism=camp_site|viewpoint|alpine_hut|wilderness_hut|hotel`, `amenity=shelter|drinking_water|ranger_station`,
  `man_made=bridge`, `place=*`; hiking route relations; and every path inside the corridor box.
- **Quality notes for this area**:
  - Corridor and Tonto trails are well mapped; lengths came within 3% of NPS figures.
  - The North Kaibab Trail's main ways were `highway=construction` (waterline project) and
    invisible to a path/footway filter.
  - Some viewpoint nodes sit at the shuttle stop rather than the overlook (The Abyss,
    Shoshone Point, Pipe Creek Vista); they were left off the sheet.
  - Santa Maria Spring's node is misplaced near the rim; the sheet places it at mile 2.5 of the
    Hermit Trail instead.
  - No nodes for the Bright Angel resthouses, Bright Angel Campground or Havasupai Gardens
    campground; those were placed from mileage or the drinking-water node cluster.
  - Peak nodes carry `ele` in metres for 55 named buttes and temples; converted to feet.
- **Fetched**: 2026-09-06.

## Reference figures used for sanity checks

National Park Service trail descriptions for the corridor (Bright Angel 9.5 mi to Bright Angel
Campground, South Kaibab 7 mi, North Kaibab 14 mi to Phantom Ranch) and the NPS backcountry
zone classes (Corridor, Threshold, Primitive, Wild) that drive the line symbology. No NPS
geometry was used.

## Portable source acquisition

The configured source path adds complete buffered-AOI OSM queries, official GNIS
natural/populated names, USGS 3DHP hydrography, PAD-US protected areas and Annual
NLCD land cover. `fetch_region.py` refreshes providers explicitly; cached builds
verify retained raw hashes. See the [data contract](specs/map-data.md#portable-region-catalogs-2026-09-09)
for identities, axis order, raster registration and provenance fields.

National feature names are transferred by explicit GNIS ID. Geometry-based hydro
coverage deduplication requires strong correspondence and compatible names;
crossing or differently named streams are retained. Current flow, potable water,
access conditions and trail maintenance cannot be established from a mapped line
or undated facility point. PAD-US category, designation and manager remain
separate fields; park, wilderness and ownership polygons may overlap.

The September 2026 source snapshots include Annual NLCD 2025. GNIS service metadata
reports a July 2026 refresh. These are dataset/snapshot dates, not claims that every
feature was surveyed then. Source-side invalid geometry is reported or explicitly
normalized with recorded area changes; it is not silently treated as valid.

Management-unit codes from the reference map, detailed backcountry-use regulations,
airspace rules and authoritative river-mile stationing remain separate acquisition
problems. The publicly found Sequoia NPS atlas metadata and Grand Canyon use-area
PDFs are dated; their existence is not evidence of current regulations. The shared
ArcGIS adapter supports additional agency layers once source currency, category
semantics and licensing have been checked. WMM declination and an airspace overlay
are optional plan items and are not invented in the generated map.

### Acquisition evidence and remaining coverage limits

The 2026-09-09 portable caches contain 222 distinct GNIS identities for Grand
Canyon and 270 for Sequoia, plus 8 and 16 PAD-US features respectively. GNIS
county joins can repeat the same identity; normalization retains its source
object IDs and all reported points. A river or broad landform can have several
points, including points outside the requested frame. These are source positions,
not independently surveyed label anchors. The [GNIS map service](https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer)
provides natural and populated names; it is not a complete contemporary directory
of visitor facilities.

The [Annual NLCD service](https://dmsdata.cr.usgs.gov/geoserver/mrlc_Land-Cover-Native_conus_year_data/wcs?service=WCS&version=1.0.0&request=GetCapabilities)
provides the 2025 categorical land-cover layer at native 30 m spacing. Acquisition
retains its grid description and native GeoTIFF, requests cell edges relative to
the reported origin, then samples categories nearest-neighbor onto the map frame.
A finer display grid adds no land-cover detail. Classification year does not
establish current vegetation, snow, fire effects, wetness or water availability.

The [3DHP service](https://3dhp.nationalmap.gov/arcgis/rest/services/usgs_3dhp_all/FeatureServer)
is a composite hydrography source. Feature dates and source identities remain in
the catalog; the retrieval date is not a uniform survey date. Missing permanence
attributes remain unknown. [PAD-US](https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-web-services)
records ownership, management and designation separately. Proposed/recommended
areas remain distinguished by source attributes and names; their presence does
not establish an enacted designation, public access or current regulations.
Geometry normalization logs describe representational repairs, not a boundary
survey or a legal determination.

The Sequoia DEM has registered 3DEP acquisition metadata and a verified array
hash. The authored Grand Canyon adapter still uses the legacy DEM/profile caches;
those files lack a retained retrieval timestamp and uniform survey date. Their
known USGS origin does not justify assigning either date retrospectively. Catalog
availability reports distinguish a missing registered region DEM cache from the
legacy terrain supplied separately by that adapter.

Requested but absent region caches and rejected source features are recorded in
`catalog.json` as `sourceInventory` and `sourceIssues`. A cached provider means
that its expected files are present and applicable checks passed; it does not
mean all real-world features are mapped. Current NPS conditions, maintenance
levels, seasonal facility operations, backcountry-use codes/regulations,
authoritative river-mile stationing and current airspace rules remain unavailable
from this acquisition path. OSM facilities and tags provide useful coverage but
cannot substitute for those authoritative operational datasets. Dated NPS atlas
and use-area references are not promoted to current data merely because they can
be downloaded.
