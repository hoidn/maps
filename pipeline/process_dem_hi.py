from path_geometry import detail_points, GEOMETRY_VERSION
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
slope = np.arctan(1.15 * np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
def shade(az, alt):
    az = np.radians(az); alt = np.radians(alt)
    return np.clip(np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - np.pi / 2 - aspect), 0, 1)
hs = 0.55 * shade(315, 45) + 0.2 * shade(270, 40) + 0.15 * shade(0, 50) + 0.10 * shade(225, 35)
hs = np.clip(hs / np.percentile(hs, 99.5), 0, 1)
def ramp(stops):
    e = np.array([s[0] for s in stops], float); c = np.array([s[1] for s in stops], float)
    return lambda z: np.stack([np.interp(z, e, c[:, i]) for i in range(3)], -1)
def hx(s): return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))
light = ramp([(2200, hx("#8f7a68")), (2900, hx("#b9a08a")), (3400, hx("#cbb99b")), (3900, hx("#d3c9a8")), (4500, hx("#dbc4a2")), (5200, hx("#e3bf9a")),
              (6000, hx("#ead0b0")), (6600, hx("#ecdfc4")), (7200, hx("#e4e3cf")), (8000, hx("#d5dcc2")), (8800, hx("#c9d3b8"))])
dark = ramp([(2200, hx("#241d19")), (2900, hx("#33291f")), (3400, hx("#3b3327")), (3900, hx("#3d3a2c")), (4500, hx("#45382c")), (5200, hx("#4d3b2c")),
             (6000, hx("#52432f")), (6600, hx("#514a37")), (7200, hx("#4b4d3c")), (8000, hx("#414b3c")), (8800, hx("#3a4638"))])
def render(rampf, lo, hi, name, q):
    img = np.clip(rampf(Z) / 255.0 * (lo + (hi - lo) * hs)[..., None], 0, 1)
    im = Image.fromarray((img * 255).astype(np.uint8)); buf = io.BytesIO()
    im.save(buf, "JPEG", quality=q, optimize=True, subsampling=1); b = buf.getvalue(); open(name, "wb").write(b)
    print(name, len(b) // 1024, "KB"); return "data:image/jpeg;base64," + base64.b64encode(b).decode()
uri_light = render(light, 0.62, 1.10, "terrain_hi_light.jpg", 72)
uri_dark = render(dark, 0.55, 1.45, "terrain_hi_dark.jpg", 72)
print("images done", round(time.time() - t0))

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
        pts = detail_points(np.column_stack([c[:, 1] * SX, c[:, 0] * SY]))
        if len(pts) < 4: continue
        npts += len(pts); ds.append("M" + " ".join(f"{x:.3f},{y:.3f}" for x, y in pts))
    out[key].append({"lv": lv, "d": ds})
print("contours done", round(time.time() - t0), "s; points", npts)
for k in out: print(k, len(out[k]), "levels", sum(len(d) for l in out[k] for d in l["d"]) // 1024, "KB")
json.dump({"geometryVersion": GEOMETRY_VERSION, "uri_light": uri_light, "uri_dark": uri_dark, "contours": out}, open("terrain_hi.json", "w"))
