from hillshade import multidirectional, refresh_cache, HILLSHADE_VERSION
import sys
from path_geometry import detail_points, contour_points, GEOMETRY_VERSION
import numpy as np, json, base64, io, time
from PIL import Image
from scipy.ndimage import gaussian_filter
from skimage import measure

t0 = time.time()
dem_m = np.load("dem_hi.npy")
H, W = dem_m.shape
Z = dem_m * 3.28084
SX, SY = 1300 / W, 1070 / H
dx = (0.364 / W) * 111320 * np.cos(np.radians(36.111)); dy = (0.242 / H) * 110970
print("pixel m", round(dx, 2), round(dy, 2), "shape", H, W)

Zs = gaussian_filter(dem_m, 1.2)
gy, gx = np.gradient(Zs, dy, dx)
hs = multidirectional(gx, gy)
hs = np.clip(hs / np.percentile(hs, 99.5), 0, 1)
def ramp(stops):
    e = np.array([s[0] for s in stops], float); c = np.array([s[1] for s in stops], float)
    return lambda z: np.stack([np.interp(z, e, c[:, i]) for i in range(3)], -1)
def hx(s): return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))
light = ramp([(2200, hx("#eee9dc")), (2900, hx("#ede7d8")), (3400, hx("#eae3d1")), (3900, hx("#e7dfcc")), (4500, hx("#e5dbc8")), (5200, hx("#e3d5be")),
              (6000, hx("#e6dcc9")), (6600, hx("#e8e1d0")), (7200, hx("#e4e3cf")), (8000, hx("#d5dcc2")), (8800, hx("#c9d3b8"))])
dark = ramp([(2200, hx("#343b3a")), (2900, hx("#373d3b")), (3400, hx("#3a403c")), (3900, hx("#3d423d")), (4500, hx("#42443e")), (5200, hx("#49483f")),
             (6000, hx("#4c4b42")), (6600, hx("#4b4d42")), (7200, hx("#474e43")), (8000, hx("#414b3c")), (8800, hx("#3a4638"))])
def render(rampf, lo, hi, name, q):
    img = np.clip(rampf(Z) / 255.0 * (lo + (hi - lo) * hs)[..., None], 0, 1)
    im = Image.fromarray((img * 255).astype(np.uint8)); buf = io.BytesIO()
    im.save(buf, "JPEG", quality=q, optimize=True, subsampling=1); b = buf.getvalue(); open(name, "wb").write(b)
    print(name, len(b) // 1024, "KB"); return "data:image/jpeg;base64," + base64.b64encode(b).decode()
uri_light = render(light, 0.80, 1.04, "terrain_hi_light.jpg", 72)
uri_dark = render(dark, 0.82, 1.20, "terrain_hi_dark.jpg", 72)
print("images done", round(time.time() - t0))
if '--shading-only' in sys.argv:
    refresh_cache('terrain_hi.json',uri_light,uri_dark)
    sys.exit(0)

# three contour ladders: base 250 ft (index 1000), fine = 100-ft levels not on the 250 ladder, finest = 50-ft levels not on the 100 ladder
Zc = gaussian_filter(Z, 1.4)
out = {"index": [], "inter": [], "fine": [], "finest": []}
npts = 0
for lv in range(2300, 8600, 50):
    if lv % 250 == 0: key = "index" if lv % 1000 == 0 else "inter"
    elif lv % 100 == 0: key = "fine"
    else: key = "finest"
    ds = []
    for c in measure.find_contours(Zc, lv):
        if len(c) < 10: continue
        pts = detail_points(contour_points(c, W, H))
        if len(pts) < 4: continue
        npts += len(pts); ds.append("M" + " ".join(f"{x:.3f},{y:.3f}" for x, y in pts))
    out[key].append({"lv": lv, "d": ds})
print("contours done", round(time.time() - t0), "s; points", npts)
for k in out: print(k, len(out[k]), "levels", sum(len(d) for l in out[k] for d in l["d"]) // 1024, "KB")
json.dump({"hillshadeVersion": HILLSHADE_VERSION, "geometryVersion": GEOMETRY_VERSION, "pixelRegistration": "center", "uri_light": uri_light, "uri_dark": uri_dark, "contours": out}, open("terrain_hi.json", "w"))
