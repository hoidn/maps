"""List and download USGS 3DEP 1-meter DEM tiles that cover the map frame.

The 1 m product is lidar-derived and supports 5-10 ft contours; the 1/3 arc-second grid used by
the current maps is good to about 20-50 ft. Tiles are 10 km x 10 km GeoTIFFs in UTM (zone 12N
here), 17-130 MB each, so this script lists first and only downloads with --download.

Usage:
    python3 fetch_dem_1m.py                 # list tiles, projects, sizes; write tiles_1m.json
    python3 fetch_dem_1m.py --download      # also download into dem_1m/ (skips files already present)
    python3 fetch_dem_1m.py --project AZ_GrandCanyonNP_2019_B19   # restrict to one project

Where several projects overlap the same tile, prefer the newest publication unless the older
one is the park-specific flight (GrandCanyonNP_2019 covers the inner canyon; the county-wide
flights may stop at the rim). Check coverage per tile with `gdalinfo -stats` or rasterio
before trusting it: nodata inside the canyon is common at project edges.
"""
import argparse, json, os, sys, requests

LON0, LAT0, LON1, LAT1 = -112.262, 35.990, -111.898, 36.232
API = "https://tnmaccess.nationalmap.gov/api/v1/products"
DATASET = "Digital Elevation Model (DEM) 1 meter"

ap = argparse.ArgumentParser()
ap.add_argument("--download", action="store_true")
ap.add_argument("--project", default=None, help="substring of the project name to keep, e.g. GrandCanyonNP_2019")
ap.add_argument("--out", default="dem_1m")
args = ap.parse_args()

items, offset = [], 0
while True:
    r = requests.get(API, params=dict(datasets=DATASET, bbox=f"{LON0},{LAT0},{LON1},{LAT1}", max=100, offset=offset, outputFormat="JSON"), timeout=120)
    r.raise_for_status(); j = r.json()
    items += j.get("items", [])
    if len(items) >= j.get("total", 0) or not j.get("items"): break
    offset += 100
if args.project: items = [it for it in items if args.project in it.get("title", "")]
items.sort(key=lambda it: it.get("title", ""))
total = sum(it.get("sizeInBytes") or 0 for it in items)
print(f"{len(items)} tiles, {total/1e9:.2f} GB")
by_proj = {}
for it in items:
    proj = it["title"].split()[-1]; by_proj.setdefault(proj, []).append(it)
for proj, its in by_proj.items():
    print(f"  {proj}: {len(its)} tiles, {sum(i.get('sizeInBytes') or 0 for i in its)/1e6:.0f} MB, published {its[0].get('publicationDate')}")
json.dump([dict(title=it["title"], url=it.get("downloadURL"), bytes=it.get("sizeInBytes"), published=it.get("publicationDate"),
                bbox=it.get("boundingBox")) for it in items], open("tiles_1m.json", "w"), indent=1)
print("wrote tiles_1m.json")
if not args.download: sys.exit(0)
os.makedirs(args.out, exist_ok=True)
for it in items:
    url = it.get("downloadURL"); name = os.path.join(args.out, url.split("/")[-1])
    if os.path.exists(name) and os.path.getsize(name) == (it.get("sizeInBytes") or -1):
        print("have", name); continue
    print("get", name, f"{(it.get('sizeInBytes') or 0)/1e6:.0f} MB")
    with requests.get(url, stream=True, timeout=900) as g:
        g.raise_for_status()
        with open(name, "wb") as f:
            for chunk in g.iter_content(1 << 20): f.write(chunk)
print("done; mosaic with: gdalbuildvrt mosaic_1m.vrt dem_1m/*.tif && gdalwarp -t_srs EPSG:4326 -tr 0.00003 0.00003 -r bilinear mosaic_1m.vrt dem_3m_wgs84.tif")
