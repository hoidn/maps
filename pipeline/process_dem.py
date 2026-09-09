from hillshade import multidirectional, refresh_cache, HILLSHADE_VERSION
import sys
from path_geometry import contour_points
import numpy as np, json, base64, io, time
from PIL import Image
from scipy.ndimage import gaussian_filter
from skimage import measure

t0=time.time()
dem_m = np.load("dem.npy")
H,W = dem_m.shape
Z = dem_m*3.28084  # feet
SX, SY = 1300/W, 1070/H   # svg units per pixel
# pixel size in metres
dx = (0.364/W)*111320*np.cos(np.radians(36.111)); dy=(0.242/H)*110970
print("pixel m", dx, dy, "shape", H, W)

# ---------- hillshade (multi-directional) ----------
Zs = gaussian_filter(dem_m, 1.0)
gy, gx = np.gradient(Zs, dy, dx)
hs = multidirectional(gx, gy)
hs = hs/np.percentile(hs,99.5); hs=np.clip(hs,0,1)
print("hillshade done", time.time()-t0)

# ---------- hypsometric ramps (feet -> rgb) ----------
def ramp(stops):
    e=np.array([s[0] for s in stops],float); c=np.array([s[1] for s in stops],float)
    return lambda z: np.stack([np.interp(z,e,c[:,i]) for i in range(3)],-1)
def hx(s): return tuple(int(s[i:i+2],16) for i in (1,3,5))
light = ramp([(2200,hx("#eee9dc")),(2900,hx("#ede7d8")),(3400,hx("#eae3d1")),(3900,hx("#e7dfcc")),
              (4500,hx("#e5dbc8")),(5200,hx("#e3d5be")),(6000,hx("#e6dcc9")),(6600,hx("#e8e1d0")),
              (7200,hx("#e4e3cf")),(8000,hx("#d5dcc2")),(8800,hx("#c9d3b8"))])
dark  = ramp([(2200,hx("#343b3a")),(2900,hx("#373d3b")),(3400,hx("#3a403c")),(3900,hx("#3d423d")),
              (4500,hx("#42443e")),(5200,hx("#49483f")),(6000,hx("#4c4b42")),(6600,hx("#4b4d42")),
              (7200,hx("#474e43")),(8000,hx("#414b3c")),(8800,hx("#3a4638"))])
def render(rampf, lo, hi, name, q):
    rgb = rampf(Z)/255.0
    # multiply-style shade: map hs to [lo,hi]
    sh = lo + (hi-lo)*hs
    img = np.clip(rgb*sh[...,None],0,1)
    im = Image.fromarray((img*255).astype(np.uint8))
    buf=io.BytesIO(); im.save(buf,"JPEG",quality=q,optimize=True,subsampling=1)
    b=buf.getvalue(); open(name,"wb").write(b)
    print(name, len(b)//1024, "KB")
    return "data:image/jpeg;base64,"+base64.b64encode(b).decode()
uri_light = render(light, 0.66, 1.00, "terrain_light.jpg", 76)
uri_dark  = render(dark,  0.64, 1.25, "terrain_dark.jpg", 76)
print("images done", time.time()-t0)
if '--shading-only' in sys.argv:
    refresh_cache('terrain.json',uri_light,uri_dark)
    sys.exit(0)

# ---------- contours ----------
Zc = gaussian_filter(Z, 1.6)
def dp(pts, tol):  # Douglas-Peucker on Nx2 array
    return measure.approximate_polygon(pts, tol)
levels = list(range(2500, 8751, 250))
out = {"index":[], "inter":[]}
npts=0
for lv in levels:
    cs = measure.find_contours(Zc, lv)
    ds=[]
    for c in cs:
        if len(c) < 12: continue
        pts = contour_points(c, W, H)
        pts = dp(pts, 0.55)
        if len(pts) < 4: continue
        npts+=len(pts)
        d = "M"+ " ".join(f"{x:.1f},{y:.1f}" for x,y in pts)
        ds.append(d)
    key = "index" if lv % 1000 == 0 else "inter"
    out[key].append({"lv":lv, "d":ds})
    print("level", lv, "segs", len(ds), round(time.time()-t0,1))
print("total points", npts)
json.dump({"hillshadeVersion":HILLSHADE_VERSION, "pixelRegistration":"center", "uri_light":uri_light,"uri_dark":uri_dark,"contours":out}, open("terrain.json","w"))
print("bytes of contour d:", sum(len(d) for k in out for l in out[k] for d in l["d"])//1024, "KB")
