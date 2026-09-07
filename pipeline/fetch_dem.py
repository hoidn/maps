import requests, tifffile, numpy as np, io, sys
LON0,LAT0,LON1,LAT1 = -112.262,35.990,-111.898,36.232
W,H = 2600,1729
url = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage"
params = dict(bbox=f"{LON0},{LAT0},{LON1},{LAT1}", bboxSR=4326, size=f"{W},{H}", imageSR=4326,
              format="tiff", pixelType="F32", noDataInterpretation="esriNoDataMatchAny",
              interpolation="RSP_BilinearInterpolation", f="image")
r = requests.get(url, params=params, timeout=300)
print("status", r.status_code, r.headers.get("content-type"), len(r.content))
if r.status_code != 200 or not r.headers.get("content-type","").startswith("image"):
    print(r.text[:500]); sys.exit(1)
open("dem.tif","wb").write(r.content)
a = tifffile.imread("dem.tif").astype(np.float32)
print("shape", a.shape, "dtype", a.dtype)
print("min/max m", np.nanmin(a), np.nanmax(a))
print("min/max ft", np.nanmin(a)*3.28084, np.nanmax(a)*3.28084)
np.save("dem.npy", a)
# sample: Phantom Ranch (36.106,-112.0945) and S Kaibab TH (36.0533,-112.0838), N Kaibab TH (36.2172,-112.0568)
def px(lat,lon): return int((LAT1-lat)/(LAT1-LAT0)*H), int((lon-LON0)/(LON1-LON0)*W)
for name,lat,lon in [("Phantom",36.106,-112.0945),("SK TH",36.0533,-112.0838),("NK TH",36.2172,-112.0568),("Grandview",35.9985,-111.9875),("Cape Royal",36.118,-111.949)]:
    i,j = px(lat,lon); print(name, round(float(a[i,j])*3.28084), "ft")
