"""Fetch the dense USGS 3DEP grid used by the interactive build.

Asks the ImageServer for a file link (f=json) and downloads the href; the inline
f=image path returned HTTP 500 at this size. Verifies the returned extent matches
the request, because the server silently expands the bbox when the pixel aspect
ratio is not square in degrees (see docs/PITFALLS.md)."""
import requests, tifffile, numpy as np, sys
LON0, LAT0, LON1, LAT1 = -112.262, 35.990, -111.898, 36.232   # same frame as osmdata.py
W, H = 3900, 2592                                             # ~8.4 m x 10.4 m per cell
url = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
p = dict(bbox=f"{LON0},{LAT0},{LON1},{LAT1}", bboxSR=4326, size=f"{W},{H}", imageSR=4326, format="tiff",
         pixelType="F32", noDataInterpretation="esriNoDataMatchAny", interpolation="RSP_BilinearInterpolation", f="json")
j = requests.get(url, params=p, timeout=300).json()
e = j["extent"]
if max(abs(e["xmin"] - LON0), abs(e["xmax"] - LON1), abs(e["ymin"] - LAT0), abs(e["ymax"] - LAT1)) > 2e-4:
    print("server changed the extent; adjust W/H so pixels are square in degrees", e); sys.exit(1)
g = requests.get(j["href"], timeout=900); g.raise_for_status()
open("dem_hi.tif", "wb").write(g.content)
a = tifffile.imread("dem_hi.tif").astype(np.float32)
print("shape", a.shape, "m range", float(a.min()), float(a.max()))
np.save("dem_hi.npy", a)
def px(lat, lon): return int((LAT1 - lat) / (LAT1 - LAT0) * H), int((lon - LON0) / (LON1 - LON0) * W)
for name, lat, lon in [("Phantom Ranch ~2,546", 36.1055, -112.0945), ("S Kaibab TH ~7,260", 36.0529, -112.0837),
                       ("N Kaibab TH ~8,241", 36.2178, -112.0559), ("Cottonwood CG ~4,080", 36.17, -112.041)]:
    i, jj = px(lat, lon); print(f"{name}: {a[i, jj] * 3.28084:.0f} ft")
