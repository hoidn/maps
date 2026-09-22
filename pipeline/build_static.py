#!/usr/bin/env python3
"""Draws the Grand Canyon trail sheet: hand-designed SVG cartography over USGS 3DEP terrain
with trail/river geometry from OpenStreetMap."""
from pathlib import Path
import json, math, html, numpy as np
from skimage.measure import approximate_polygon
from label_manifest import Manifest, embedded_fonts, layout_script
M = Manifest("static")
from water_areas import WaterAreas
import osmdata as o
from osmdata import P, hav, length, LAT0, LAT1, LON0, LON1, W, H

from map_spec import validate_legacy_terrain_frame
validate_legacy_terrain_frame(o.SPEC)

T = json.load(open("terrain.json"))
DEM = np.load("dem.npy") * 3.28084
DH, DW = DEM.shape
esc = html.escape

def elev(lat, lon):
    r = (LAT1 - lat) / (LAT1 - LAT0) * (DH - 1); c = (lon - LON0) / (LON1 - LON0) * (DW - 1)
    r = min(max(r, 0), DH - 1.001); c = min(max(c, 0), DW - 1.001)
    r0, c0 = int(r), int(c); fr, fc = r - r0, c - c0
    return float(DEM[r0, c0] * (1 - fr) * (1 - fc) + DEM[r0 + 1, c0] * fr * (1 - fc)
                 + DEM[r0, c0 + 1] * (1 - fr) * fc + DEM[r0 + 1, c0 + 1] * fr * fc)

# ---------------------------------------------------------------- geometry helpers
MARG = 40
def inframe(xy, m=MARG): return -m <= xy[0] <= W + m and -m <= xy[1] <= H + m
def clip_runs(coords):
    pts = [P(*c) for c in coords]
    runs, cur = [], []
    for i, p in enumerate(pts):
        if inframe(p):
            if not cur and i > 0: cur.append(pts[i - 1])
            cur.append(p)
        else:
            if cur: cur.append(p); runs.append(cur); cur = []
    if cur: runs.append(cur)
    return runs
def simplify(pts, tol):
    arr = np.array(pts, float)
    if len(arr) > 2: arr = approximate_polygon(arr, tol)
    return arr
def d_of(pts, tol=0.3):
    return "M" + " ".join(f"{x:.1f},{y:.1f}" for x, y in simplify(pts, tol))
def path_el(coords, cls, tol=0.3):
    return "".join(f'<path class="{cls}" d="{d_of(run, tol)}"/>' for run in clip_runs(coords) if len(run) >= 2)
def cum(chain):
    cs = [0.0]
    for i in range(1, len(chain)): cs.append(cs[-1] + hav(chain[i - 1], chain[i]))
    return cs
def along(chain, target):
    cs = cum(chain); i = min(range(len(chain)), key=lambda k: hav(chain[k], target)); return cs[i], i
def point_at(chain, mi):
    cs = cum(chain)
    for i in range(1, len(chain)):
        if cs[i] >= mi:
            f = (mi - cs[i - 1]) / max(cs[i] - cs[i - 1], 1e-9); a, b = chain[i - 1], chain[i]
            return (a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f)
    return chain[-1]
def orient(chain, start_near):
    return chain if hav(chain[0], start_near) <= hav(chain[-1], start_near) else chain[::-1]
def split_by(coords, fn):
    runs, cur, curk = [], [], None
    for c in coords:
        k = fn(*c)
        if k != curk and cur:
            runs.append((curk, cur)); cur = [cur[-1]]
        cur.append(c); curk = k
    if cur: runs.append((curk, cur))
    return runs

# ---------------------------------------------------------------- label helpers
def _label_svg(lat, lon, text, cls="l-place", dx=0, dy=0, anchor="start", rot=0, sub=None):
    x, y = P(lat, lon); x += dx; y += dy
    tr = f' transform="rotate({rot} {x:.1f} {y:.1f})"' if rot else ""
    if sub:
        return (f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}"{tr}>{esc(text)}'
                f'<tspan class="l-sub" x="{x:.1f}" dy="9.5">{esc(sub)}</tspan></text>')
    return f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}"{tr}>{esc(text)}</text>'

def L(lat, lon, text, cls="l-place", dx=0, dy=0, anchor="start", rot=0, sub=None, source_id=None):
    return M.label(_label_svg(lat, lon, text, cls, dx, dy, anchor, rot, sub),
                   text, cls, P(lat, lon), angle=rot, source_id=source_id)

def text_at(x, y, text, cls, anchor="start", rot=0):
    tr = f' transform="rotate({rot} {x:.1f} {y:.1f})"' if rot else ""
    return f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" text-anchor="{anchor}"{tr}>{esc(text)}</text>'

def _trail_label_svg(chain, m0, m1, text, cls, off=9, flip=False):
    a = P(*point_at(chain, m0)); b = P(*point_at(chain, m1))
    mx, my = (a[0] + b[0]) / 2, (a[1] + b[1]) / 2
    ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    if ang > 90: ang -= 180
    if ang < -90: ang += 180
    rad = math.radians(ang); nx, ny = math.sin(rad), -math.cos(rad)
    s = -1 if flip else 1
    x, y = mx + nx * off * s, my + ny * off * s
    return text_at(x, y, text, cls, "middle", round(ang, 1))
def trail_label(chain, m0, m1, text, cls, off=9, flip=False):
    a, b = P(*point_at(chain, m0)), P(*point_at(chain, m1))
    xy = ((a[0]+b[0])/2, (a[1]+b[1])/2)
    return M.label(_trail_label_svg(chain,m0,m1,text,cls,off,flip),text,cls,xy,kind="line-label")

def trail_label_near(chain, lat, lon, half, text, cls, off=9, flip=False):
    d, _ = along(chain, (lat, lon))
    return trail_label(chain, max(d - half, 0), d + half, text, cls, off, flip)

# ---------------------------------------------------------------- symbols
from cartography.symbols import camp_symbol, symbol_svg, symbol_at
def _symbol_svg(kind, lat, lon, dx=0, dy=0):
    x, y = P(lat, lon)
    return symbol_at(kind,x+dx,y+dy)

def sym(kind, lat, lon, dx=0, dy=0, source_id=None):
    return M.symbol(_symbol_svg(kind,lat,lon,dx,dy),kind,P(lat,lon),(dx,dy),source_id=source_id)

# ---------------------------------------------------------------- data selections
BA = orient(o.longest("Bright Angel Trail"), (36.0573, -112.1436))
SK = orient(o.longest("South Kaibab Trail"), (36.0529, -112.0837))
NK = orient(o.longest("North Kaibab Trail"), (36.1014, -112.0897))   # starts at Black Bridge north end
RIVER_TRAIL = orient(o.longest("River Trail"), (36.0984, -112.1113))
HERMIT = orient(o.longest("Hermit Trail"), (36.0605, -112.2125))
GRANDVIEW = orient(o.longest("Grandview Trail"), (35.9985, -111.9877))
CLEAR = orient(o.longest("Clear Creek Trail"), (36.1107, -112.0916))
TONTO_W = o.chain_near("Tonto Trail", 36.0783, -112.1273)      # 57 mi chain, ends at Havasupai Gardens
TONTO_W = orient(TONTO_W, (36.0783, -112.1273))                  # start at HG, run west
TONTO_E = orient(o.chain_near("Tonto Trail", 36.0449, -111.9204), (36.0819, -112.1246))  # HG -> Hance Rapids
BOUCHER = orient(o.chain_near("Boucher Trail", 36.0603, -112.2364), (36.0603, -112.2364))
NEWHANCE = orient(o.longest("New Hance Trail"), (35.9907, -111.9357))
OLDBA = orient(o.longest("Old Bright Angel Trail"), (36.2396, -112.0163))
ESCAL = orient(o.longest("Escalante Route"), (36.0449, -111.9204))
WIDF = orient(o.longest("Widforss Trail"), (36.2237, -112.0650))
KENP = orient(o.longest("Ken Patrick Trail"), (36.2178, -112.0559))
UNCLE = o.longest("Uncle Jim Trail")
TRANSEPT = orient(o.longest("Transept Trail"), (36.1960, -112.0513))
RIM = orient(o.longest("Rim Trail"), (36.0528, -112.0837))
CAPEF = orient(o.longest("Cape Final Trail"), (36.1458, -111.9356))
WALH = o.longest("Walhalla Glades Trail")
WALDRON = orient(o.chain_near("Waldron Trail", 36.0550, -112.2211), (36.0380, -112.2192))
DRIP = orient(o.chain_near("Dripping Springs Trail", 36.0621, -112.2424), (36.0560, -112.2247))
PLATEAU = o.longest("Plateau Point Trail")

def tonto_class(lat, lon):
    if lon < -112.2045 or lon > -111.962: return "primitive"
    return "threshold"

trails_svg = {"rim": [], "primitive": [], "threshold": [], "corridor": []}
def add(cls, coords, tol=0.35, name=""):
    if coords: trails_svg[cls].append(path_el(coords, f"tr tr-{cls}", tol).replace('<path ', f'<path data-name="{esc(name)}" '))
for chain in o.TRAILS.get("Tonto Trail", []):
    for k, run in split_by(chain, tonto_class): add(k, run, name="Tonto Trail")
for n in ["West Tonto Trail", "Grandview Trail", "Horseshoe Mesa East Trail", "Cottonwood Creek Trail", "Hance Creek Trail", "Clear Creek Trail", "Hermit Trail"]:
    for c in o.TRAILS.get(n, []): add("threshold", c, name=n)
add("threshold", DRIP, name="Dripping Springs Trail")
for n in ["Boucher Trail", "New Hance Trail", "Old Bright Angel Trail", "Escalante Route"]:
    for c in o.TRAILS.get(n, []): add("primitive", c, name=n)
add("primitive", WALDRON, name="Waldron Trail")
for n in ["Rim Trail", "West Rim Trail", "Widforss Trail", "Ken Patrick Trail", "Uncle Jim Trail", "Transept Trail", "Bright Angel Point Trail", "Cape Royal Trail", "Cape Final Trail", "Cliff Spring Trail", "Bridle Trail", "Walhalla Glades Trail", "Roosevelt Point Loop", "Shoshone Point Trail"]:
    for c in o.TRAILS.get(n, []): add("rim", c, name=n)
for n in ["Bright Angel Trail", "River Trail", "South Kaibab Trail", "North Kaibab Trail", "Bright Angel Campground Route", "Bright Angel Suspension Bridge", "Kaibab Suspension Bridge", "Phantom Ranch Village Trail", "Plateau Point Trail", "Ribbon Falls Trail", "Roaring Springs Trail", "Supai Tunnel", "Redwall Bridge", "Boat Beach Trail", "Pipe Creek Beach Trail"]:
    for c in o.TRAILS.get(n, []): add("corridor", c, 0.3, name=n)
# 4WD tracks to Point Sublime / Tiyo Point
tracks_svg = "".join(path_el(c, "road road-track") for n in ["Point Sublime Trail", "Tiyo Point Trail"] for c in o.TRAILS.get(n, []))

# roads
KEEP_ROADS = {"Center Road", "Village Loop Drive", "Cape Royal Drive", "Cape Royal Road", "West Rim Drive", "Pima Point Access Road",
              "North Rim Campground Road", "Yavapai Lodge Road", "Market Plaza Road", "Zuni Way", "Hopi Point Access Road"}
roads_case, roads_fill = [], []
for name, hw, coords in o.roads:
    if hw in ("primary", "secondary") or name in KEEP_ROADS:
        cls = "road-major" if hw in ("primary", "secondary") else "road-minor"
        for run in clip_runs(coords):
            if len(run) < 2: continue
            d = d_of(run, 0.4)
            roads_case.append(f'<path class="road-case {cls}" d="{d}"/>')
            roads_fill.append(f'<path class="road-fill {cls}" d="{d}"/>')

# hydrography
water_areas = WaterAreas.from_cache("water.json", P, (0, 0, W, H))
hydro = [f'<path class="river-area" fill-rule="evenodd" d="{d}"/>' for d in water_areas.paths()]
hydro_defs, hydro_labels = [], []
def run_length(run): return sum(math.hypot(run[i+1][0]-run[i][0], run[i+1][1]-run[i][1]) for i in range(len(run)-1))
def oriented(run):
    dx = run[-1][0] - run[0][0]; dy = run[-1][1] - run[0][1]
    if dx < -20 or (abs(dx) <= 20 and dy > 0): return run[::-1]
    return run
hid = 0
for name, chains in o.streams.items():
    is_river = name == "Colorado River"
    cls = "river" if is_river else ("creek creek-major" if name == "Bright Angel Creek" else "creek")
    best, bestlen = None, 0
    for c in chains:
        for run in clip_runs(c):
            if len(run) < 2: continue
            for water_run in (water_areas.uncovered_runs(run) if is_river else [run]):
                hydro.append(f'<path class="{cls}" d="{d_of(water_run, 0.3 if is_river else 0.4)}"/>')
            rl = run_length(run)
            if rl > bestlen: bestlen, best = rl, run
    if best is None: continue
    if is_river:
        pts = simplify(oriented(best), 0.5); hid += 1
        hydro_defs.append(f'<path id="h{hid}" d="{"M"+" ".join(f"{x:.1f},{y:.1f}" for x,y in pts)}"/>')
        for off in ("14%", "58%", "86%"):
            hydro_labels.append(f'<text class="l-river" dy="-7"><textPath href="#h{hid}" startOffset="{off}" text-anchor="middle">Colorado River</textPath></text>')
    elif bestlen >= 110 and name.strip() not in ("?", ""):
        pts = simplify(oriented(best), 0.5); hid += 1
        hydro_defs.append(f'<path id="h{hid}" d="{"M"+" ".join(f"{x:.1f},{y:.1f}" for x,y in pts)}"/>')
        hydro_labels.append(f'<text class="l-hydro" dy="-4"><textPath href="#h{hid}" startOffset="50%" text-anchor="middle">{esc(name)}</textPath></text>')

# contours
def parse_d(d): return [tuple(map(float, p.split(","))) for p in d[1:].split(" ")]
contour_inter = "".join(f'<path class="ci" d="{"".join(lv["d"])}"/>' for lv in T["contours"]["inter"])
contour_index = "".join(f'<path class="cx" d="{"".join(lv["d"])}"/>' for lv in T["contours"]["index"])
contour_defs, contour_labels = [], []
cid = 0
for lv in T["contours"]["index"]:
    segs = sorted((run_length(parse_d(d)), d) for d in lv["d"])[::-1]
    n = 0
    for ln, d in segs:
        if ln < 340 or n >= 6: break
        pts = oriented(parse_d(d)); cid += 1; n += 1
        contour_defs.append(f'<path id="c{cid}" d="{"M"+" ".join(f"{x:.1f},{y:.1f}" for x,y in pts)}"/>')
        for off in (["30%", "72%"] if ln > 900 else ["50%"]):
            contour_labels.append(f'<text class="l-contour" dy="2.6"><textPath href="#c{cid}" startOffset="{off}" text-anchor="middle">{lv["lv"]:,}</textPath></text>')

# ---------------------------------------------------------------- symbols + labels (hand placed)
S, LB = [], []
def place(kind, lat, lon, text=None, cls="l-place", dx=7, dy=4, anchor="start", sub=None, rot=0):
    S.append(sym(kind, lat, lon))
    if text: LB.append(L(lat, lon, text, cls, dx, dy, anchor, rot, sub))

# South Rim viewpoints & trailheads
place("th", 36.0605, -112.2125, "Hermits Rest", dx=-9, dy=13, anchor="end", sub="Hermit Trail TH")
place("view", 36.0718, -112.2001, "Pima Point", dx=0, dy=-7, anchor="middle")
place("view", 36.0724, -112.1660, "Mohave Point", dx=0, dy=-7, anchor="middle")
place("view", 36.0745, -112.1549, "Hopi Point", dx=0, dy=-7, anchor="middle")
place("view", 36.0719, -112.1484, "Maricopa Pt", dx=7, dy=9)
place("view", 36.0621, -112.1464, "Trailview Overlook", dx=-7, dy=4, anchor="end")
place("th", 36.0573, -112.1436, "Bright Angel TH", dx=-9, dy=4, anchor="end")
LB.append(L(36.0545, -112.1406, "GRAND CANYON VILLAGE", "l-village", 0, 16, "middle"))
place("view", 36.0660, -112.1168, "Yavapai Point", dx=0, dy=-7, anchor="middle")
place("view", 36.0617, -112.1080, "Mather Point", dx=7, dy=-2)
LB.append(L(36.0594, -112.1076, "Visitor Center", "l-minor", 8, 11))
place("view", 36.0586, -112.0838, "Yaki Point", dx=7, dy=-2)
place("th", 36.0529, -112.0837, "South Kaibab TH", dx=8, dy=4)
place("th", 35.9985, -111.9878, "Grandview Point", dx=-9, dy=-4, anchor="end", sub="Grandview Trail TH")
place("view", 36.0052, -111.9243, "Moran Point", dx=-7, dy=-5, anchor="end")
place("th", 35.9907, -111.9357, "New Hance TH", dx=-9, dy=-2, anchor="end")
S.append(sym("camp", 36.0496, -112.1196)); LB.append(L(36.0496, -112.1196, "Mather CG", "l-minor", 9, 4))
# North Rim
place("th", 36.2178, -112.0559, "North Kaibab TH", dx=9, dy=4)
place("lodge", 36.2005, -112.0532, "Grand Canyon Lodge", dx=-9, dy=4, anchor="end")
place("view", 36.1935, -112.0487, "Bright Angel Point", dx=7, dy=9)
place("camp", 36.2103, -112.0604, "North Rim CG", dx=-10, dy=4, anchor="end")
place("th", 36.2237, -112.0650, "Widforss TH", dx=-9, dy=4, anchor="end")
place("view", 36.1840, -112.0864, "Widforss Point", dx=-7, dy=4, anchor="end")
place("view", 36.1984, -112.2506, "Point Sublime", dx=8, dy=4)
S.append(sym("camp", 36.2021, -112.2486, 0, -12))
place("view", 36.1806, -112.1283, "Tiyo Point", dx=7, dy=4)
place("view", 36.1172, -111.9488, "Cape Royal", cls="l-place", dx=8, dy=4)
LB.append(L(36.1201, -111.9467, "Angels Window", "l-minor", 8, -2))
place("view", 36.1423, -111.9081, "Cape Final", dx=-8, dy=-4, anchor="end")
S.append(sym("camp", 36.1423, -111.9081, 0, 12))
place("view", 36.1316, -111.9418, "Walhalla Overlook", dx=-8, dy=4, anchor="end")
place("view", 36.2180, -111.9525, "Roosevelt Point", dx=8, dy=4)
place("spring", 36.1251, -111.9540, "Cliff Spring", cls="l-minor", dx=-6, dy=4, anchor="end")
# Bright Angel Trail stops
rh15 = point_at(BA, 1.5); rh3 = point_at(BA, 3.0)
place("shelter", *rh15, "1½ Mile Resthouse", dx=8, dy=4)
place("shelter", *rh3, "3 Mile Resthouse", dx=8, dy=4)
place("camp", 36.0779, -112.1285, "Havasupai Gardens", dx=10, dy=1, sub="CG · water · ranger")
S.append(sym("water", 36.0779, -112.1285, -12, 0))
place("view", 36.0933, -112.1161, "Plateau Point", dx=0, dy=-7, anchor="middle")
LB.append(L(36.0872, -112.1110, "Devils Corkscrew", "l-minor", 7, 4))
place("shelter", 36.0984, -112.1113, "River Resthouse", dx=-8, dy=12, anchor="end")
place("bridge", 36.0977, -112.0955, "Silver Bridge", cls="l-minor", dx=-6, dy=13, anchor="end")
place("bridge", 36.1009, -112.0892, "Black Bridge", cls="l-minor", dx=6, dy=13)
place("camp", 36.1012, -112.0960, "Bright Angel CG", dx=-10, dy=4, anchor="end")
place("lodge", 36.1055, -112.0945, "Phantom Ranch", cls="l-major", dx=10, dy=-3, sub="canteen · water · ranger")
S.append(sym("water", 36.1055, -112.0945, -11, -1))
# South Kaibab stops
place("wp", 36.0615, -112.0870, "Ooh Aah Point", dx=8, dy=4)
place("wp", 36.0642, -112.0896, "Cedar Ridge", dx=8, dy=4)
place("wp", 36.0817, -112.0904, "Skeleton Point", dx=8, dy=4)
place("wp", 36.0916, -112.0898, "The Tipoff", dx=8, dy=4)
# North Kaibab stops
place("wp", 36.2154, -112.0530, "Coconino Overlook", dx=8, dy=4)
place("wp", 36.2112, -112.0495, "Supai Tunnel", dx=8, dy=4); S.append(sym("water", 36.2112, -112.0495, 60, 0))
place("bridge", 36.2072, -112.0466, "Redwall Bridge", cls="l-minor", dx=8, dy=4)
place("water", 36.1955, -112.0352, "Roaring Springs", dx=8, dy=4)
place("water", 36.1858, -112.0321, "Manzanita Rest Area", dx=8, dy=4)
place("camp", 36.1700, -112.0410, "Cottonwood CG", dx=10, dy=4, sub="water · ranger (seasonal)")
S.append(sym("water", 36.1700, -112.0410, -12, 0))
place("falls", 36.1593, -112.0555, "Ribbon Falls", dx=-8, dy=4, anchor="end")
place("camp", 36.1142, -112.0110, "Clear Creek CG", dx=9, dy=4)
# Hermit / Tonto country
place("camp", 36.0822, -112.2127, "Hermit Creek CG", dx=-10, dy=4, anchor="end")
place("camp", 36.0995, -112.2093, "Hermit Rapids", cls="l-minor", dx=0, dy=-10, anchor="middle")
smsp = point_at(HERMIT, 2.5)
place("spring", *smsp, "Santa Maria Spring", cls="l-minor", dx=7, dy=4)
place("spring", 36.0624, -112.2423, "Dripping Springs", cls="l-minor", dx=7, dy=-4)
place("camp", 36.0828, -112.1865, "Monument Creek", cls="l-minor", dx=-9, dy=12, anchor="end")
place("camp", 36.0975, -112.1820, "Granite Rapids", cls="l-minor", dx=0, dy=-10, anchor="middle")
place("camp", 36.0842, -112.1620, "Salt Creek", cls="l-minor", dx=0, dy=15, anchor="middle")
place("camp", 36.0893, -112.1785, "Cedar Spring", cls="l-minor", dx=0, dy=-10, anchor="middle")
place("camp", 36.0849, -112.1438, "Horn Creek", cls="l-minor", dx=0, dy=15, anchor="middle")
place("camp", 36.1047, -112.2369, "Boucher Creek", cls="l-minor", dx=9, dy=4)
place("camp", 36.0198, -111.9746, "Horseshoe Mesa CG", dx=10, dy=4)
LB.append(L(36.0449, -111.9204, "Hance Rapids", "l-minor", 0, -8, "middle"))
place("spring", 36.0766, -112.1001, "Burro Spring", cls="l-minor", dx=6, dy=9)
LB.append(L(36.1290, -112.0780, "THE BOX", "l-region-s", 0, 0, "middle", rot=-52))

# Peaks (from OSM natural=peak, elevation converted to feet)
SKIP_PEAKS = {"Sumner Point", "Grandeur Point", "Horseshoe Mesa", "The Tipoff", "Hopi Wall"}
PEAK_LEFT = {"O'Neill Butte", "Pattie Butte", "Newton Butte", "Cheops Pyramid", "Sumner Butte", "Hattan Butte", "Clement Powell Butte", "Marsh Butte", "Whites Butte"}
peaks = []
for p in o.pois:
    t = p["tags"]
    if t.get("natural") != "peak" or "name" not in t or t["name"] in SKIP_PEAKS: continue
    if not inframe(P(p["lat"], p["lon"]), -8): continue
    ft = f'{round(float(t["ele"]) * 3.28084 / 1) :,.0f}' if t.get("ele") else ""
    left = t["name"] in PEAK_LEFT
    peaks.append(sym("peak", p["lat"], p["lon"],source_id=p["id"]))
    peaks.append(L(p["lat"], p["lon"], t["name"], "l-peak", -7 if left else 7, 3, "end" if left else "start", sub=(ft + " ft") if ft else None,source_id=p["id"]))

# Region names
REG = [
    (36.226, -112.150, "KAIBAB PLATEAU", 0), (36.227, -112.005, "NORTH RIM", 0),
    (36.180, -111.968, "WALHALLA PLATEAU", -78), (36.018, -112.180, "COCONINO PLATEAU", 0), (36.020, -112.050, "SOUTH RIM", 0),
    (36.0715, -112.190, "TONTO PLATFORM", -4), (36.0765, -112.060, "TONTO PLATFORM", -6),
    (36.104, -112.163, "UPPER GRANITE GORGE", -6), (36.147, -112.076, "BRIGHT ANGEL CANYON", -58),
    (36.060, -112.010, "GRAPEVINE CANYON", -40),
]
regions = "".join(L(la, lo, tx, "l-region", 0, 0, "middle", rot) for la, lo, tx, rot in REG)

# Trail name labels
TL = []
TL.append(trail_label(BA, 3.4, 4.2, "Bright Angel Trail", "l-trail-c", 11))
TL.append(trail_label(SK, 1.7, 2.7, "South Kaibab Trail", "l-trail-c", 10, flip=True))
TL.append(trail_label(NK, 6.0, 7.2, "North Kaibab Trail", "l-trail-c", 10))
TL.append(trail_label(NK, 11.2, 12.2, "North Kaibab Trail", "l-trail-c", 10))
TL.append(trail_label(RIVER_TRAIL, 0.6, 1.2, "River Trail", "l-trail-cs", 8))
TL.append(trail_label_near(TONTO_W, 36.0790, -112.152, 0.5, "Tonto Trail", "l-trail", 9))
TL.append(trail_label_near(TONTO_W, 36.0785, -112.197, 0.5, "Tonto Trail", "l-trail", 9))
TL.append(trail_label_near(TONTO_E, 36.0805, -112.108, 0.5, "Tonto Trail", "l-trail", 9))
TL.append(trail_label_near(TONTO_E, 36.0800, -112.050, 0.5, "Tonto Trail", "l-trail", 9))
TL.append(trail_label_near(TONTO_E, 36.0500, -112.000, 0.5, "Tonto Trail", "l-trail", 9))
TL.append(trail_label_near(TONTO_E, 36.0350, -111.950, 0.5, "Tonto Trail", "l-trail", 9))
TL.append(trail_label(HERMIT, 3.0, 3.9, "Hermit Trail", "l-trail", 9))
TL.append(trail_label(GRANDVIEW, 0.9, 1.7, "Grandview Trail", "l-trail", 9))
TL.append(trail_label(CLEAR, 3.4, 4.6, "Clear Creek Trail", "l-trail", 9))
TL.append(trail_label(NEWHANCE, 2.2, 3.2, "New Hance Trail", "l-trail", 9))
TL.append(trail_label(BOUCHER, 2.3, 3.3, "Boucher Trail", "l-trail", 9))
TL.append(trail_label(OLDBA, 1.8, 2.8, "Old Bright Angel Trail", "l-trail", 9))
TL.append(trail_label(ESCAL, 0.6, 1.6, "Escalante Route", "l-trail", 9))
TL.append(trail_label(WIDF, 1.6, 2.6, "Widforss Trail", "l-trail-r", 9))
TL.append(trail_label(KENP, 1.2, 2.2, "Ken Patrick Trail", "l-trail-r", 9))
TL.append(trail_label(UNCLE, 0.9, 1.6, "Uncle Jim Trail", "l-trail-r", 9))
TL.append(trail_label(TRANSEPT, 0.8, 1.5, "Transept Trail", "l-trail-r", 9))
TL.append(trail_label_near(RIM, 36.0660, -112.1300, 0.45, "Rim Trail", "l-trail-r", 8, flip=True))
TL.append(trail_label_near(RIM, 36.0700, -112.1850, 0.45, "Rim Trail", "l-trail-r", 8, flip=True))
TL.append(trail_label(CAPEF, 0.7, 1.4, "Cape Final Trail", "l-trail-r", 9))
if WALH: TL.append(trail_label(WALH, 2.0, 3.0, "Walhalla Glades Trail", "l-trail-r", 9))
TL.append(trail_label(WALDRON, 0.6, 1.3, "Waldron Trail", "l-trail", 9))
TL.append(trail_label(DRIP, 0.4, 1.0, "Dripping Springs Trail", "l-trail", 9))

# Off-frame pointers
east = max((c for _, hw, cs in o.roads if hw == "primary" for c in cs if c[1] <= LON1 + 0.001), key=lambda c: c[1], default=None)
if east: LB.append(L(*east, "Desert View 4 mi →", "l-minor", -6, -6, "end"))
kp_top = min(KENP, key=lambda c: abs(c[0] - LAT1) if c[0] <= LAT1 else 9)
LB.append(L(*kp_top, "to Point Imperial ↗", "l-minor", 8, 12))

# ---------------------------------------------------------------- cartouche & scale
MI = 0.017888 * (W / (LON1 - LON0))   # px per mile at 36.11°N
KM = MI / 1.609344
def scalebar(x, y):
    s = [f'<g class="scale" transform="translate({x},{y})">',
         f'<rect class="panel" x="-10" y="-14" width="{5*MI+70:.0f}" height="48" rx="3"/>']
    for i in range(6):
        s.append(f'<rect x="{i*MI:.1f}" y="0" width="{MI:.1f}" height="5" class="{"sb-a" if i%2==0 else "sb-b"}"/>')
        s.append(text_at(i * MI, -4, str(i), "l-scale", "middle"))
    s.append(text_at(5 * MI + 8, 5, "miles", "l-scale"))
    for i in range(8):
        s.append(f'<rect x="{i*KM:.1f}" y="12" width="{KM:.1f}" height="5" class="{"sb-a" if i%2==0 else "sb-b"}"/>')
        if i % 2 == 0: s.append(text_at(i * KM, 28, str(i), "l-scale", "middle"))
    s.append(text_at(8 * KM, 28, "8", "l-scale", "middle")); s.append(text_at(8 * KM + 8, 17, "km", "l-scale"))
    s.append("</g>")
    return "".join(s)

cartouche = f'''
<g class="cartouche" transform="translate(22,22)">
  <rect class="panel" x="0" y="0" width="318" height="116" rx="3"/>
  <text class="c-title" x="16" y="42">Grand Canyon</text>
  <text class="c-sub" x="16" y="63">TRAILS OF THE CENTRAL CANYON</text>
  <text class="c-note" x="16" y="82">Hermits Rest to Cape Royal · corridor, Tonto &amp; rim trails</text>
  <text class="c-note" x="16" y="97">Terrain USGS 3DEP · contours every 250 ft, index 1,000 ft</text>
  <g transform="translate(284,46)">
    <path class="n-arrow" d="M0,-24 L7,8 L0,2 L-7,8 Z"/>
    <path class="n-arrow-half" d="M0,-24 L7,8 L0,2 Z"/>
    <text class="c-n" x="0" y="26" text-anchor="middle">N</text>
  </g>
</g>'''

# ---------------------------------------------------------------- assemble SVG
svg = f'''<svg class="map" viewBox="0 0 {W} {H}" role="img" aria-label="Hand-drawn map of the central Grand Canyon showing the Bright Angel, South Kaibab, North Kaibab, Tonto, Hermit, Grandview and rim trails over USGS shaded relief and 250-foot contours" xmlns="http://www.w3.org/2000/svg">
<defs>{"".join(hydro_defs)}{"".join(contour_defs)}</defs>
<image class="terrain t-light" href="{T["uri_light"]}" x="0" y="0" width="{W}" height="{H}" preserveAspectRatio="none"/>
<image class="terrain t-dark" href="{T["uri_dark"]}" x="0" y="0" width="{W}" height="{H}" preserveAspectRatio="none"/>
<g class="contours">{contour_inter}{contour_index}</g>
<g class="contour-labels">{"".join(contour_labels)}</g>
<g class="hydro">{"".join(hydro)}</g>
<g class="roads">{tracks_svg}{"".join(roads_case)}{"".join(roads_fill)}</g>
<g class="trails">{"".join(trails_svg["rim"])}{"".join(trails_svg["primitive"])}{"".join(trails_svg["threshold"])}{"".join(trails_svg["corridor"])}</g>
<g class="regions">{regions}</g>
<g class="hydro-labels">{"".join(hydro_labels)}</g>
<g class="peaks">{"".join(peaks)}</g>
<g class="symbols">{"".join(S)}</g>
<g class="trail-labels">{"".join(TL)}</g>
<g class="labels">{"".join(LB)}</g>
{cartouche}
{scalebar(34, H - 40)}
<rect class="neatline" x="0.5" y="0.5" width="{W-1}" height="{H-1}"/>
</svg>'''

from cartography.integration import improve, catalog_panel, transport_legend
svg, cartography_context = improve(svg, M, DEM / 3.28084, o.SPEC)
svg = M.finalize(svg)

# ---------------------------------------------------------------- mileage tables & profile
def stops_table(chain, stops, title, note):
    rows = []
    for name, target, extra in stops:
        if target == "start": d, pt = 0.0, chain[0]
        elif target == "end": d, pt = length(chain), chain[-1]
        elif isinstance(target, tuple) and target and target[0] == "fixed": d, pt = target[1], target[2]
        elif isinstance(target, float): d, pt = target, point_at(chain, target)
        else: d, i = along(chain, target); pt = chain[i]
        rows.append(f'<tr><td>{esc(name)}</td><td class="num">{d:.1f}</td><td class="num">{round(elev(*pt)/10)*10:,.0f}</td><td class="amen">{extra}</td></tr>')
    return f'''<div class="mtable"><h3>{title}</h3><p class="tnote">{note}</p>
<table><thead><tr><th>Point</th><th class="num">Mile</th><th class="num">Elev ft</th><th>Facilities</th></tr></thead><tbody>{"".join(rows)}</tbody></table></div>'''

BA_FULL = BA + [c for c in orient(o.longest("River Trail"), BA[-1])][1:]
silver_d, _ = along(BA_FULL, (36.0970, -112.0957))
ba_stops = [("Bright Angel Trailhead", "start", "water"), ("1½ Mile Resthouse", 1.5, "water May–Sep · toilet"), ("3 Mile Resthouse", 3.0, "water May–Sep · toilet"),
            ("Havasupai Gardens", (36.0779, -112.1285), "water · campground · ranger"), ("Plateau Point junction", (36.0859, -112.1245), "spur 0.7 mi to overlook"),
            ("River Resthouse", BA[-1], "toilet"), ("Silver Bridge", (36.0970, -112.0957), "cross to north bank"),
            ("Bright Angel Campground", ("fixed", silver_d + 0.45, (36.1012, -112.0960)), "water · campground"), ("Phantom Ranch", ("fixed", silver_d + 0.8, (36.1055, -112.0945)), "water · canteen · ranger")]
sk_stops = [("South Kaibab Trailhead", "start", "no water"), ("Ooh Aah Point", (36.0615, -112.0870), ""), ("Cedar Ridge", (36.0642, -112.0896), "toilet"),
            ("Skeleton Point", (36.0817, -112.0904), ""), ("The Tipoff", (36.0916, -112.0898), "toilet · Tonto Trail jct"), ("Black Bridge", (36.1004, -112.0888), "cross to north bank"),
            ("Bright Angel Campground", ("fixed", length(SK) + 0.5, (36.1012, -112.0960)), "water · campground")]
NKr = NK[::-1]  # trailhead first
nk_stops = [("North Kaibab Trailhead", "start", "water May–Oct"), ("Coconino Overlook", (36.2154, -112.0530), ""), ("Supai Tunnel", (36.2112, -112.0495), "water May–Oct · toilet"),
            ("Redwall Bridge", (36.2072, -112.0466), ""), ("Roaring Springs junction", (36.1927, -112.0345), "water May–Oct"), ("Manzanita Rest Area", (36.1858, -112.0321), "water year-round · toilet"),
            ("Cottonwood Campground", (36.1700, -112.0410), "water May–Oct · campground · ranger"), ("Ribbon Falls junction", (36.1590, -112.0522), "spur to falls"),
            ("Phantom Ranch", (36.1055, -112.0945), "water · canteen · ranger"), ("Black Bridge", "end", "")]
tables = (stops_table(BA_FULL, ba_stops, "Bright Angel Trail", "South Rim to the river, via Havasupai Gardens. The only corridor trail with water on the way.")
          + stops_table(SK, sk_stops, "South Kaibab Trail", "Ridge-top route with the big views and no water or shade. Descend here, come up Bright Angel.")
          + stops_table(NKr, nk_stops, "North Kaibab Trail", "North Rim to Phantom Ranch down Roaring Springs and Bright Angel canyons. Twice the length of its southern partners."))

# rim-to-rim profile
R2R = SK + NK[1:]
total = length(R2R)
cs = cum(R2R)
samples = []
mi = 0.0
while mi <= total:
    pt = point_at(R2R, mi); samples.append((mi, elev(*pt))); mi += 0.02
samples.append((total, elev(*R2R[-1])))
ev = np.array([s[1] for s in samples]); k = 5
evs = np.convolve(np.pad(ev, (k//2, k//2), mode="edge"), np.ones(k)/k, mode="valid")
samples = [(s[0], float(e)) for s, e in zip(samples, evs)]
def elev_at(mi):
    i = min(range(len(samples)), key=lambda k: abs(samples[k][0]-mi)); return samples[i][1]
WP = [("S. Kaibab TH", R2R[0]), ("Cedar Ridge", (36.0642, -112.0896)), ("Skeleton Pt", (36.0817, -112.0904)), ("The Tipoff", (36.0916, -112.0898)),
      ("Black Bridge", (36.1004, -112.0888)), ("Phantom Ranch", (36.1055, -112.0945)), ("Ribbon Falls jct", (36.1590, -112.0522)), ("Cottonwood CG", (36.1700, -112.0410)),
      ("Manzanita", (36.1858, -112.0321)), ("Roaring Springs", (36.1927, -112.0345)), ("Supai Tunnel", (36.2112, -112.0495)), ("N. Kaibab TH", R2R[-1])]
wps = []
for name, tgt in WP:
    d, i = along(R2R, tgt); wps.append((name, d, elev_at(d)))
CW, CH, ML, MR, MT, MB = 1300, 330, 66, 30, 44, 42
EMIN, EMAX = 2000, 8500
def cx(m): return ML + m / total * (CW - ML - MR)
def cy(e): return MT + (EMAX - e) / (EMAX - EMIN) * (CH - MT - MB)
line = "M" + " ".join(f"{cx(m):.1f},{cy(e):.1f}" for m, e in samples)
area = line + f" L{cx(total):.1f},{cy(EMIN):.1f} L{cx(0):.1f},{cy(EMIN):.1f} Z"
grid = "".join(f'<line class="grid" x1="{ML}" x2="{CW-MR}" y1="{cy(e):.1f}" y2="{cy(e):.1f}"/><text class="ax" x="{ML-8}" y="{cy(e)+3.5:.1f}" text-anchor="end">{e:,}</text>' for e in range(3000, 8001, 1000))
xt = "".join(f'<text class="ax" x="{cx(m):.1f}" y="{CH-MB+16}" text-anchor="middle">{m}</text>' for m in range(0, int(total)+1, 2))
marks = "".join(f'<line class="wpl" x1="{cx(d):.1f}" x2="{cx(d):.1f}" y1="{cy(e):.1f}" y2="{cy(e)-14:.1f}"/><circle class="wpm" cx="{cx(d):.1f}" cy="{cy(e):.1f}" r="4"/>'
                f'<text class="wpt" x="{cx(d)+3:.1f}" y="{cy(e)-17:.1f}" transform="rotate(-38 {cx(d)+3:.1f} {cy(e)-17:.1f})">{esc(n)}</text>' for n, d, e in wps)
profile_svg = f'''<svg class="profile" viewBox="0 0 {CW} {CH}" role="img" aria-label="Elevation profile from the South Kaibab trailhead down to the Colorado River and up the North Kaibab Trail to the North Rim">
{grid}<line class="axis" x1="{ML}" x2="{CW-MR}" y1="{cy(EMIN):.1f}" y2="{cy(EMIN):.1f}"/>{xt}
<text class="ax" x="{(ML+CW-MR)/2:.0f}" y="{CH-4}" text-anchor="middle">miles from the South Kaibab trailhead</text>
<text class="ax" x="{ML-8}" y="{MT-14}" text-anchor="end">feet</text>
<path class="p-area" d="{area}"/><path class="p-line" d="{line}"/>{marks}
<g class="hover" hidden><line class="xh" x1="0" x2="0" y1="{MT}" y2="{cy(EMIN):.1f}"/><circle class="xd" r="5"/></g>
</svg>'''
prof_json = json.dumps({"samples": [(round(m, 2), round(e)) for m, e in samples[::2]], "wps": [(n, round(d, 2)) for n, d, _ in wps],
                        "geom": {"ML": ML, "MR": MR, "MT": MT, "MB": MB, "CW": CW, "CH": CH, "EMIN": EMIN, "EMAX": EMAX, "total": round(total, 2)}})

# other trails table
def d_between(chain, a, b): return abs(along(chain, a)[0] - along(chain, b)[0])
HG = (36.0779, -112.1285); TIP = (36.0916, -112.0898); HERMC = (36.0822, -112.2127); GVJ = (36.0368, -111.9778); HANCE = (36.0449, -111.9204)
hermit_camp = along(HERMIT, HERMC)[0]
others = [
    ("Hermit Trail", "Hermits Rest → Hermit Creek camp", hermit_camp, "threshold", "Santa Maria Spring at 2.5 mi (treat). Steep, rocky, no maintenance below the Cathedral Stairs."),
    ("Hermit Trail", "→ Colorado River (Hermit Rapids)", length(HERMIT), "threshold", "Follows Hermit Creek to the beach."),
    ("Dripping Springs Trail", "Hermits Rest → Dripping Springs", along(HERMIT, DRIP[0])[0] + length(DRIP), "threshold", "Leaves the Hermit Trail 1.3 mi down. Rim-level day hike."),
    ("Boucher Trail", "Dripping Springs jct → Boucher Creek", length(BOUCHER), "primitive", "Exposed traverse under Yuma Point, then a brutal descent. Experts only."),
    ("Tonto Trail", "Hermit Creek ↔ Havasupai Gardens", d_between(TONTO_W, HERMC, HG), "threshold", "Waterless between Monument Creek and Havasupai Gardens; camps at Monument, Cedar Spring, Salt, Horn."),
    ("Tonto Trail", "Havasupai Gardens ↔ The Tipoff", d_between(TONTO_E, HG, TIP), "threshold", "Links Bright Angel and South Kaibab for the classic loop."),
    ("Tonto Trail", "The Tipoff ↔ Grandview jct (Horseshoe Mesa)", d_between(TONTO_E, TIP, GVJ), "threshold", "Long, dry contour around Cremation, Lonetree, Boulder and Grapevine canyons."),
    ("Tonto Trail", "Grandview jct ↔ Hance Rapids", d_between(TONTO_E, GVJ, HANCE), "primitive", "Eastern end of the Tonto; Hance Creek is the reliable water."),
    ("Grandview Trail", "Grandview Point → Horseshoe Mesa camp", along(GRANDVIEW, (36.0198, -111.9746))[0], "threshold", "Cobblestone switchbacks built for the mines. Spring water at Page and Miners springs (mineralised)."),
    ("New Hance Trail", "Desert View Dr → Hance Rapids", length(NEWHANCE), "primitive", "Steepest and roughest South Rim trail, down Red Canyon."),
    ("Clear Creek Trail", "Phantom Ranch → Clear Creek", length(CLEAR), "threshold", "Climbs to the Tonto and heads east above the river. Camp at Clear Creek."),
    ("Escalante Route", "Hance Rapids → Tanner (off sheet)", 9.4, "primitive", "River-corridor route east to the Tanner Trail; leaves the sheet at Papago Creek."),
    ("Rim Trail", "South Kaibab TH → Hermits Rest", length(RIM), "rim", "Paved or graded almost the whole way; shuttle stops throughout."),
    ("Old Bright Angel Trail", "North Rim road → Roaring Springs jct", length(OLDBA), "primitive", "Historic, unmaintained line into Bright Angel Canyon."),
    ("Widforss Trail", "Widforss TH → Widforss Point", length(WIDF), "rim", "Forest and rim views over The Transept."),
    ("Ken Patrick Trail", "North Kaibab TH → Point Imperial", length(KENP), "rim", "Rolling plateau forest to the park's highest overlook."),
    ("Transept Trail", "Grand Canyon Lodge → North Rim CG", length(TRANSEPT), "rim", "Rim-edge connector."),
    ("Uncle Jim Trail", "North Kaibab TH → Uncle Jim Point loop", 5.0, "rim", "Mule and hiker loop to a viewpoint over Roaring Springs Canyon."),
    ("Cape Final Trail", "Cape Royal Rd → Cape Final", length(CAPEF), "rim", "Easy walk to a lonely eastern viewpoint; one backcountry site."),
    ("Cape Royal Trail", "Parking → Cape Royal", 0.4, "rim", "Paved, past Angels Window."),
]
other_rows = "".join(f'<tr><td><span class="sw sw-{c}"></span>{esc(n)}</td><td>{esc(seg)}</td><td class="num">{d:.1f}</td><td class="desc">{esc(note)}</td></tr>' for n, seg, d, c, note in others)

# ---------------------------------------------------------------- HTML
CSS = r'''
:root{
  --paper:#F0EBDF; --panel:#F8F4EA; --ink:#2B2520; --ink-2:#5A5147; --muted:#867B6E; --rule:#D9D0BF;
  --corridor:#B0361F; --corridor-lbl:#8E2B18; --thresh:#2B2520; --rim:#3F6B45; --camp:#2E6B3B;
  --river:#2F6C90; --creek:#4C88AA; --hydro-lbl:#245B7E;
  --road:#7D7568; --road-fill:#F6F0E3; --track:#8F877A;
  --contour:#A86A3A; --contour-idx:#8A4E22; --contour-lbl:#7A4620; --c-op:.5; --cx-op:.8;
  --halo:rgba(243,236,222,.86); --halo-solid:#F0EBDF; --peak:#5A4A3A;
  --terrain-light:inline; --terrain-dark:none;
  --grid:#E0D7C6; --chart-fill:rgba(176,54,31,.12); --panel-op:.9;
  --sans:'Source Sans 3','Helvetica Neue',Arial,sans-serif; --serif:'Alegreya',Georgia,serif; --display:'Bree Serif','Rockwell',Georgia,serif;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){ :root:not([data-theme="light"]){
  --paper:#17140F; --panel:#211D17; --ink:#EDE5D6; --ink-2:#C4BAA8; --muted:#948A7D; --rule:#3A342B;
  --corridor:#F07A5C; --corridor-lbl:#F7A58F; --thresh:#EDE5D6; --rim:#9FCB95; --camp:#8FD08F;
  --river:#6FB3D8; --creek:#5C98BD; --hydro-lbl:#8FC6E6;
  --road:#A39A8C; --road-fill:#2A251E; --track:#8A8275;
  --contour:#D9A06A; --contour-idx:#EBB983; --contour-lbl:#EBB983; --c-op:.42; --cx-op:.66;
  --halo:rgba(23,20,15,.82); --halo-solid:#17140F; --peak:#D8CBB6;
  --terrain-light:none; --terrain-dark:inline;
  --grid:#2E2822; --chart-fill:rgba(240,122,92,.16); --panel-op:.88; color-scheme:dark;
}}
:root[data-theme="dark"]{
  --paper:#17140F; --panel:#211D17; --ink:#EDE5D6; --ink-2:#C4BAA8; --muted:#948A7D; --rule:#3A342B;
  --corridor:#F07A5C; --corridor-lbl:#F7A58F; --thresh:#EDE5D6; --rim:#9FCB95; --camp:#8FD08F;
  --river:#6FB3D8; --creek:#5C98BD; --hydro-lbl:#8FC6E6;
  --road:#A39A8C; --road-fill:#2A251E; --track:#8A8275;
  --contour:#D9A06A; --contour-idx:#EBB983; --contour-lbl:#EBB983; --c-op:.42; --cx-op:.66;
  --halo:rgba(23,20,15,.82); --halo-solid:#17140F; --peak:#D8CBB6;
  --terrain-light:none; --terrain-dark:inline;
  --grid:#2E2822; --chart-fill:rgba(240,122,92,.16); --panel-op:.88; color-scheme:dark;
}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:15px;line-height:1.5}
.sheet{max-width:1340px;margin:0 auto;padding:28px 20px 60px}
.mast{display:flex;justify-content:space-between;align-items:flex-end;gap:32px;flex-wrap:wrap;margin-bottom:18px;padding-bottom:16px;border-bottom:1.5px solid var(--ink)}
.eyebrow{margin:0 0 4px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2)}
h1{margin:0;font-family:var(--display);font-weight:400;font-size:clamp(34px,4.5vw,52px);line-height:1.02;letter-spacing:-.005em;text-wrap:balance}
.lede{margin:10px 0 0;max-width:60ch;font-size:17px;color:var(--ink-2)}
.facts{display:grid;grid-template-columns:auto auto;gap:3px 14px;margin:0;font-size:13px}
.facts dt{color:var(--muted);text-transform:uppercase;letter-spacing:.08em;font-size:11px;padding-top:2px}
.facts dd{margin:0;font-variant-numeric:tabular-nums}
figure{margin:0}
.map-fig{border:1px solid var(--rule);background:var(--paper)}
.map{display:block;width:100%;height:auto}
.map text{font-family:var(--sans);paint-order:stroke fill;stroke:var(--halo);stroke-width:2.8px;stroke-linejoin:round;fill:var(--ink)}
.terrain{image-rendering:auto}
.t-light{display:var(--terrain-light)} .t-dark{display:var(--terrain-dark)}
.ci{fill:none;stroke:var(--contour);stroke-width:.55;opacity:var(--c-op);stroke-linejoin:round}
.cx{fill:none;stroke:var(--contour-idx);stroke-width:1;opacity:var(--cx-op);stroke-linejoin:round}
.l-contour{font-size:8px;fill:var(--contour-lbl);font-weight:600;letter-spacing:.03em;stroke-width:2px}
.river-area{fill:var(--river);stroke:none}
.river{fill:none;stroke:var(--river);stroke-width:4.2;stroke-linejoin:round;stroke-linecap:round}
.creek{fill:none;stroke:var(--creek);stroke-width:.9;stroke-linejoin:round;stroke-linecap:round;opacity:.9}
.creek-major{stroke-width:1.7}
.l-river{font-family:var(--serif);font-style:italic;font-size:13px;letter-spacing:.16em;fill:var(--hydro-lbl);stroke-width:2.4px}
.l-hydro{font-family:var(--serif);font-style:italic;font-size:9.5px;fill:var(--hydro-lbl);stroke-width:2.2px}
.road-case{fill:none;stroke:var(--road);stroke-linecap:round;stroke-linejoin:round}
.road-fill{fill:none;stroke:var(--road-fill);stroke-linecap:round;stroke-linejoin:round}
.road-case.road-major{stroke-width:3.4} .road-fill.road-major{stroke-width:1.6}
.road-case.road-minor{stroke-width:2.4} .road-fill.road-minor{stroke-width:1}
.road-track{fill:none;stroke:var(--track);stroke-width:1;stroke-dasharray:4 3;opacity:.8}
.tr{fill:none;stroke-linejoin:round;stroke-linecap:round}
.tr-corridor{stroke:var(--corridor);stroke-width:2.6}
.tr-threshold{stroke:var(--thresh);stroke-width:1.7}
.tr-primitive{stroke:var(--thresh);stroke-width:1.3;stroke-dasharray:5 3.5}
.tr-rim{stroke:var(--rim);stroke-width:1.5;stroke-dasharray:1.5 2.6;stroke-linecap:round}
.l-trail{font-size:10.5px;font-weight:600;font-style:italic;fill:var(--ink)}
.l-trail-c{font-size:11px;font-weight:700;font-style:italic;fill:var(--corridor-lbl)}
.l-trail-cs{font-size:9.5px;font-weight:600;font-style:italic;fill:var(--corridor-lbl)}
.l-trail-r{font-size:10px;font-weight:600;font-style:italic;fill:var(--rim)}
.l-place{font-size:10.5px;font-weight:600}
.l-major{font-size:12.5px;font-weight:700}
.l-village{font-size:11px;font-weight:700;letter-spacing:.12em}
.l-minor{font-size:9px;font-weight:400;fill:var(--ink-2)}
.l-sub{font-size:8px;font-weight:400;fill:var(--ink-2)}
.l-peak{font-size:8.5px;fill:var(--peak);font-weight:400}
.l-region{font-size:12.5px;font-weight:600;letter-spacing:.22em;fill:var(--ink-2);opacity:.78;stroke-width:2px}
.l-region-s{font-size:9.5px;font-weight:600;letter-spacing:.2em;fill:var(--ink-2);opacity:.85;stroke-width:2px}
.s-camp{fill:var(--camp);stroke:var(--halo-solid);stroke-width:1.2;stroke-linejoin:round}
.s-camp-base{fill:none;stroke:var(--camp);stroke-width:1.6;stroke-linecap:round}
.s-th{fill:var(--ink);stroke:var(--halo-solid);stroke-width:1.4}
.s-water{fill:var(--river);stroke:var(--halo-solid);stroke-width:1.1}
.s-shelter{fill:var(--halo-solid);stroke:var(--ink);stroke-width:1.3;stroke-linejoin:round}
.s-lodge{fill:var(--ink);stroke:var(--halo-solid);stroke-width:1.2;stroke-linejoin:round}
.s-bridge{fill:var(--halo-solid);stroke:var(--ink);stroke-width:1.3}
.s-view{fill:var(--halo-solid);stroke:var(--ink);stroke-width:1.3}
.s-peak{fill:var(--peak);stroke:var(--halo-solid);stroke-width:.9;stroke-linejoin:round}
.s-spring{fill:var(--halo-solid);stroke:var(--river);stroke-width:1.3}
.s-wp{fill:var(--corridor);stroke:var(--halo-solid);stroke-width:1.5}
.s-wp2{fill:var(--ink);stroke:var(--halo-solid);stroke-width:1.4}
.s-falls{fill:none;stroke:var(--river);stroke-width:1.4;stroke-linecap:round}
.panel{fill:var(--panel);fill-opacity:var(--panel-op);stroke:var(--ink);stroke-width:.8}
.c-title{font-family:var(--display);font-size:30px;fill:var(--ink);stroke:none}
.c-sub{font-size:11px;font-weight:600;letter-spacing:.2em;fill:var(--ink);stroke:none}
.c-note{font-size:9.5px;fill:var(--ink-2);stroke:none}
.c-n{font-size:11px;font-weight:700;stroke:none}
.n-arrow{fill:var(--panel);stroke:var(--ink);stroke-width:1;stroke-linejoin:round}
.n-arrow-half{fill:var(--ink)}
.sb-a{fill:var(--ink)} .sb-b{fill:var(--panel);stroke:var(--ink);stroke-width:.6}
.l-scale{font-size:8.5px;fill:var(--ink);stroke:none}
.neatline{fill:none;stroke:var(--ink);stroke-width:1}
figcaption.legend{display:flex;flex-wrap:wrap;gap:8px 22px;align-items:center;padding:12px 16px;border-top:1px solid var(--rule);font-size:12.5px;color:var(--ink-2)}
.legend .lg{display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.legend svg{width:34px;height:14px;overflow:visible}
.legend .lg-title{font-weight:700;letter-spacing:.1em;text-transform:uppercase;font-size:11px;color:var(--ink);margin-right:4px}
section{margin-top:44px}
h2{font-family:var(--display);font-weight:400;font-size:28px;margin:0 0 6px;text-wrap:balance}
.sec-lede{margin:0 0 18px;max-width:70ch;color:var(--ink-2)}
.mtables{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:22px 28px}
.mtable h3{margin:0 0 2px;font-size:17px;font-weight:700}
.tnote{margin:0 0 8px;font-size:13px;color:var(--ink-2)}
table{border-collapse:collapse;width:100%;font-size:13.5px}
th{text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600;padding:6px 8px 6px 0;border-bottom:1px solid var(--ink)}
td{padding:5px 8px 5px 0;border-bottom:1px solid var(--rule);vertical-align:top}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;padding-right:14px}
td.amen,td.desc{color:var(--ink-2);font-size:12.5px}
.sw{display:inline-block;width:22px;height:0;border-top:3px solid var(--thresh);margin-right:8px;vertical-align:middle}
.sw-corridor{border-top-color:var(--corridor)} .sw-primitive{border-top-style:dashed;border-top-width:2px} .sw-rim{border-top-style:dotted;border-top-color:var(--rim)}
.profile-wrap{position:relative}
.profile{display:block;width:100%;height:auto}
.profile text{font-family:var(--sans);fill:var(--ink-2)}
.grid{stroke:var(--grid);stroke-width:1} .axis{stroke:var(--ink-2);stroke-width:1}
.ax{font-size:11px;font-variant-numeric:tabular-nums}
.p-area{fill:var(--chart-fill)} .p-line{fill:none;stroke:var(--corridor);stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.wpm{fill:var(--corridor);stroke:var(--paper);stroke-width:2} .wpl{stroke:var(--ink-2);stroke-width:.8}
.wpt{font-size:10.5px;fill:var(--ink)}
.hover[hidden]{display:none}
.xh{stroke:var(--ink-2);stroke-width:1;stroke-dasharray:3 3} .xd{fill:var(--corridor);stroke:var(--paper);stroke-width:2}
.tip{position:absolute;pointer-events:none;background:var(--panel);border:1px solid var(--rule);border-radius:3px;padding:6px 9px;font-size:12.5px;line-height:1.35;box-shadow:0 2px 10px rgba(0,0,0,.12);white-space:nowrap;transform:translate(-50%,-110%)}
.tip b{font-variant-numeric:tabular-nums}
.notes{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px 32px}
.notes h3{margin:0 0 4px;font-size:15px}
.notes p{margin:0;font-size:14px;color:var(--ink-2)}
footer{margin-top:40px;padding-top:14px;border-top:1px solid var(--rule);font-size:12.5px;color:var(--muted);max-width:90ch}
footer p{margin:0 0 6px}
a{color:inherit}
@media (prefers-reduced-motion:no-preference){.hover *{transition:none}}
'''

JS = r'''
(function(){
  var data = PROFILE_JSON;
  var svg = document.querySelector('.profile'); if(!svg) return;
  var g = data.geom, hov = svg.querySelector('.hover'), xh = svg.querySelector('.xh'), xd = svg.querySelector('.xd');
  var tip = document.createElement('div'); tip.className='tip'; tip.hidden = true; svg.parentNode.appendChild(tip);
  function cx(m){ return g.ML + m/g.total*(g.CW-g.ML-g.MR); }
  function cy(e){ return g.MT + (g.EMAX-e)/(g.EMAX-g.EMIN)*(g.CH-g.MT-g.MB); }
  svg.addEventListener('mousemove', function(ev){
    var r = svg.getBoundingClientRect(); var sx = (ev.clientX - r.left) * g.CW / r.width;
    var m = (sx - g.ML)/(g.CW-g.ML-g.MR)*g.total; if(m<0||m>g.total){ hov.hidden=true; tip.hidden=true; return; }
    var best=data.samples[0]; for(var i=0;i<data.samples.length;i++){ if(Math.abs(data.samples[i][0]-m)<Math.abs(best[0]-m)) best=data.samples[i]; }
    var near=null; for(var j=0;j<data.wps.length;j++){ if(Math.abs(data.wps[j][1]-m)<0.35 && (!near||Math.abs(data.wps[j][1]-m)<Math.abs(near[1]-m))) near=data.wps[j]; }
    hov.hidden=false; xh.setAttribute('x1',cx(best[0])); xh.setAttribute('x2',cx(best[0])); xd.setAttribute('cx',cx(best[0])); xd.setAttribute('cy',cy(best[1]));
    tip.hidden=false; tip.innerHTML = (near? '<div>'+near[0]+'</div>':'') + '<b>'+best[0].toFixed(1)+' mi</b> · <b>'+best[1].toLocaleString()+' ft</b>';
    tip.style.left = (cx(best[0])*r.width/g.CW)+'px'; tip.style.top = (cy(best[1])*r.height/g.CH - 8)+'px';
  });
  svg.addEventListener('mouseleave', function(){ hov.hidden=true; tip.hidden=true; });
})();
'''.replace("PROFILE_JSON", prof_json)

def lg(kind, label):
    if kind == "corridor": sw = '<svg viewBox="0 0 34 14"><line x1="0" y1="7" x2="34" y2="7" class="tr tr-corridor"/></svg>'
    elif kind == "threshold": sw = '<svg viewBox="0 0 34 14"><line x1="0" y1="7" x2="34" y2="7" class="tr tr-threshold"/></svg>'
    elif kind == "primitive": sw = '<svg viewBox="0 0 34 14"><line x1="0" y1="7" x2="34" y2="7" class="tr tr-primitive"/></svg>'
    elif kind == "rim": sw = '<svg viewBox="0 0 34 14"><line x1="0" y1="7" x2="34" y2="7" class="tr tr-rim"/></svg>'
    elif kind == "road": sw = '<svg viewBox="0 0 34 14"><line x1="0" y1="7" x2="34" y2="7" class="road-case road-major"/><line x1="0" y1="7" x2="34" y2="7" class="road-fill road-major"/></svg>'
    elif kind == "river": sw = '<svg viewBox="0 0 34 14"><path d="M0,9 C10,3 22,11 34,5" class="river" style="stroke-width:3"/></svg>'
    elif kind == "contour": sw = '<svg viewBox="0 0 34 14"><path d="M0,4 C10,0 20,8 34,3" class="cx" style="opacity:1"/><path d="M0,11 C10,7 20,14 34,9" class="ci" style="opacity:1;stroke-width:.8"/></svg>'
    else:
        inner = symbol_at(kind,17,7)
        sw = f'<svg viewBox="0 0 34 14">{inner}</svg>'
    return f'<span class="lg">{sw}{label}</span>'
legend = "".join([
    '<span class="lg-title">Trails</span>', lg("corridor", "Corridor (maintained, ranger-patrolled)"), lg("threshold", "Threshold (maintained less; carry a map)"),
    lg("primitive", "Primitive route (unmaintained, experienced only)"), lg("rim", "Rim & plateau walks"),
    '<span class="lg-title">Terrain</span>', lg("contour", "Contours 250 ft, index 1,000 ft"), lg("river", "Colorado River & creeks"), lg("road", "Paved road"),
    '<span class="lg-title">Places</span>', lg("th", "Trailhead"), lg("camp", "Campground / campsite"), lg("wp", "Trail landmark"), lg("shelter", "Resthouse"),
    lg("lodge", "Lodge or ranch"), lg("water", "Drinking water"), lg("spring", "Spring (treat)"), lg("bridge", "Bridge"), lg("view", "Viewpoint"), lg("peak", "Butte or temple, summit ft"),
])

page = f'''<meta charset="utf-8">
<title>Grand Canyon Trail Sheet</title>
<style>{embedded_fonts()}{CSS}{(Path(__file__).parent/'cartography/styles.css').read_text()}\n[data-layout-id]{{visibility:hidden}}</style>
<main class="sheet">
<header class="mast">
  <div>
    <p class="eyebrow">Grand Canyon National Park · Arizona</p>
    <h1>Grand Canyon Trail Sheet</h1>
    <p class="lede">The central canyon from Hermits Rest to Cape Royal: the three corridor trails, the Tonto, the Hermit and Grandview trails and the rim walks, drawn over USGS elevation data.</p>
  </div>
  <dl class="facts">
    <dt>Scale</dt><dd>1 mile ≈ {MI:.0f} px (about 1:90,000 at full width)</dd>
    <dt>Contours</dt><dd>250 ft, index every 1,000 ft</dd>
    <dt>Terrain</dt><dd>USGS 3DEP ⅓-arc-second DEM, fetched 2026-09-06</dd>
    <dt>Lines</dt><dd>Trails and roads: OpenStreetMap · water: USGS and OSM</dd>
  </dl>
</header>
<figure class="map-fig">
{svg}
<figcaption class="legend">{transport_legend(cartography_context) or legend}</figcaption>
</figure>

<section id="corridor">
  <h2>Corridor mileages</h2>
  <p class="sec-lede">Distances are measured along the mapped trail line and rounded to a tenth of a mile; elevations are read from the USGS terrain at each point, so they can differ by a few tens of feet from the numbers on park signs.</p>
  <div class="mtables">{tables}</div>
</section>

<section id="profile">
  <h2>Rim to rim, South Kaibab to North Kaibab</h2>
  <p class="sec-lede">{total:.1f} miles from the South Kaibab trailhead to the North Kaibab trailhead, sampled from the terrain every 100 feet along the trail. Move across the chart for mile and elevation.</p>
  <div class="profile-wrap">{profile_svg}</div>
</section>

<section id="beyond">
  <h2>Beyond the corridor</h2>
  <p class="sec-lede">One-way distances for the other trails on the sheet. Threshold and primitive trails have no ranger presence, sparse or no water, and demand route-finding.</p>
  <div style="overflow-x:auto"><table class="others"><thead><tr><th>Trail</th><th>Segment</th><th class="num">Miles</th><th>Notes</th></tr></thead><tbody>{other_rows}</tbody></table></div>
</section>

<section id="notes">
  <h2>Before you go</h2>
  <div class="notes">
    <div><h3>Heat and distance</h3><p>Inner-canyon temperatures run 20–30 °F hotter than the rims and regularly top 110 °F in summer. The park advises against hiking from the rim to the river and back in one day. Plan by time, not distance: going up takes about twice as long as coming down.</p></div>
    <div><h3>Water</h3><p>South Kaibab has none. Bright Angel has seasonal taps at the two resthouses and year-round water at Havasupai Gardens, Bright Angel Campground and Phantom Ranch. North Kaibab taps are seasonal (roughly May to October) except Manzanita. Pipeline breaks shut taps without notice; carry a filter and check the park's water status page.</p></div>
    <div><h3>Permits</h3><p>Any night below the rim outside Phantom Ranch needs a backcountry permit; Phantom Ranch beds run on a lottery 15 months out. Rim campgrounds (Mather, North Rim) book through recreation.gov.</p></div>
    <div><h3>Access and closures</h3><p>Hermit Road and Yaki Point Road are shuttle-only most of the year. The North Rim is open mid-May to mid-October. Transcanyon waterline construction has closed sections of the North Kaibab and Bright Angel trails on a rolling schedule since 2024; confirm current closures with the park before committing to a corridor loop.</p></div>
  </div>
</section>

{catalog_panel(cartography_context)}
<footer>
  <p>Terrain: U.S. Geological Survey 3D Elevation Program, ⅓-arc-second DEM served by the 3DEP Elevation ImageServer; neutral hillshade and contours computed from that grid for this sheet. Supplemental hydrography and natural-feature names: USGS 3DHP and GNIS. Land cover: Annual NLCD; protected areas: PAD-US. Source snapshots and dates are listed above. Trails, roads, streams, campsites and summit names and elevations: © OpenStreetMap contributors (ODbL). Symbology, labels, layout and the rim-to-rim profile were drawn for this sheet.</p>
  <p>Schematic reference, not for navigation. Trail lines and mileages carry mapping error of a few hundred feet; use the park's official trail guides and current conditions for planning.</p>
</footer>
</main>
{M.script()}
{layout_script()}
<script>{JS}</script>
'''
open("grand_canyon_trails.html", "w").write(page)
print("wrote", len(page) // 1024, "KB; r2r", round(total, 2), "mi; wps", [(n, round(d, 1), round(e)) for n, d, e in wps])
print("silver", round(silver_d, 2), "hermit camp", round(hermit_camp, 2))
