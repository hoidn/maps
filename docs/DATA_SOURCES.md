# Data sources

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
