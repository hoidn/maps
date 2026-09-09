import json, math
from collections import defaultdict
from map_spec import MapSpec
SPEC = MapSpec.load('grand_canyon')
LON0,LAT0,LON1,LAT1 = SPEC.bbox
W,H = SPEC.width,SPEC.height
def P(lat,lon): return ((lon-LON0)/(LON1-LON0)*W, (LAT1-lat)/(LAT1-LAT0)*H)
def hav(a,b):
    R=3958.8; la1,lo1=map(math.radians,a); la2,lo2=map(math.radians,b)
    h=math.sin((la2-la1)/2)**2+math.cos(la1)*math.cos(la2)*math.sin((lo2-lo1)/2)**2
    return 2*R*math.asin(math.sqrt(h))
def length(coords): return sum(hav(coords[i],coords[i+1]) for i in range(len(coords)-1))

els={}
for f in ("osm.json","osm2.json"):
    for e in json.load(open(f))["elements"]:
        els[(e["type"],e["id"])]=e
els=list(els.values())
nodes={e["id"]:(e["lat"],e["lon"]) for e in els if e["type"]=="node"}
ways={e["id"]:e for e in els if e["type"]=="way"}
rels=[e for e in els if e["type"]=="relation"]
def norm(n): return " ".join(w[:1].upper()+w[1:] for w in n.replace("’","'").split())

def merge_coords(chains, tol_mi=0.03):
    """chains: list of coord lists. Merge by endpoint proximity (tolerance in miles)."""
    chains=[list(c) for c in chains if len(c)>1]
    changed=True
    while changed:
        changed=False
        for i in range(len(chains)):
            if changed: break
            for j in range(len(chains)):
                if i==j: continue
                a,b=chains[i],chains[j]
                if hav(a[-1],b[0])<tol_mi: chains[i]=a+b; del chains[j]; changed=True; break
                if hav(a[-1],b[-1])<tol_mi: chains[i]=a+b[::-1]; del chains[j]; changed=True; break
                if hav(a[0],b[-1])<tol_mi: chains[i]=b+a; del chains[j]; changed=True; break
                if hav(a[0],b[0])<tol_mi: chains[i]=b[::-1]+a; del chains[j]; changed=True; break
    return chains
def wcoords(w): return [nodes[n] for n in w["nodes"] if n in nodes]

TRAILS=defaultdict(list); kinds={}
# 1) relations
covered=set()
for r in rels:
    t=r.get("tags",{}); n=norm(t.get("name","?"))
    ws=[ways[m["ref"]] for m in r["members"] if m["type"]=="way" and m["ref"] in ways]
    if not ws: continue
    TRAILS[n]=merge_coords([wcoords(w) for w in ws]); kinds[n]="rel"; covered.add(n)
# 2) named ways not covered by a relation
byname=defaultdict(list)
for w in ways.values():
    t=w.get("tags",{})
    if "name" not in t: continue
    hw=t.get("highway"); ww=t.get("waterway")
    if hw in ("path","footway","track","steps","bridleway","construction") or ww:
        n=norm(t["name"])
        if n in covered: continue
        byname[n].append(wcoords(w)); kinds[n]=hw or ww
for n,cl in byname.items(): TRAILS[n]=merge_coords(cl)

roads=[]  # (name, class, coords)
for w in ways.values():
    t=w.get("tags",{}); hw=t.get("highway")
    if hw in ("primary","secondary","tertiary","unclassified","residential","service"):
        roads.append((norm(t.get("name","")), hw, wcoords(w)))
streams=defaultdict(list)
for w in ways.values():
    t=w.get("tags",{})
    if t.get("waterway") in ("river","stream"):
        streams[norm(t.get("name","?"))].append(wcoords(w))
pois=[]
for e in els:
    t=e.get("tags",{})
    if e["type"]=="node" and t: pois.append(dict(id=e["id"],lat=e["lat"],lon=e["lon"],tags=t))
def poi(name):
    for p in pois:
        if norm(p["tags"].get("name",""))==norm(name): return (p["lat"],p["lon"])
    return None
def chain_near(name, lat, lon):
    best=None; bd=1e9
    for c in TRAILS.get(name,[]):
        for q in c:
            d=hav(q,(lat,lon))
            if d<bd: bd=d; best=c
    return best
def longest(name):
    cs=TRAILS.get(name,[]); return max(cs,key=length) if cs else None
if __name__=="__main__":
    import numpy as np
    dem=np.load("dem.npy")*3.28084
    def elev(lat,lon):
        i=int((LAT1-lat)/(LAT1-LAT0)*dem.shape[0]); j=int((lon-LON0)/(LON1-LON0)*dem.shape[1])
        i=min(max(i,0),dem.shape[0]-1); j=min(max(j,0),dem.shape[1]-1); return dem[i,j]
    for n in ["North Kaibab Trail","South Kaibab Trail","Bright Angel Trail","Rim Trail","Tonto Trail","Hermit Trail","Grandview Trail","Clear Creek Trail","Widforss Trail","Ken Patrick Trail","Uncle Jim Trail","Old Bright Angel Trail","Bright Angel Campground Route","Phantom Ranch Village Trail","Kaibab Suspension Bridge","Bright Angel Suspension Bridge","River Trail","Transept Trail","Bright Angel Point Trail"]:
        print(n, kinds.get(n))
        for c in TRAILS.get(n,[]):
            print(f"    {length(c):6.2f} mi n={len(c):5d} A=({c[0][0]:.4f},{c[0][1]:.4f}) {elev(*c[0]):5.0f}ft  B=({c[-1][0]:.4f},{c[-1][1]:.4f}) {elev(*c[-1]):5.0f}ft")
