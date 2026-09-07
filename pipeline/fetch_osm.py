import requests, json, sys
S,W_,N,E = 35.990,-112.262,36.232,-111.898
bb = f"({S},{W_},{N},{E})"
q = f"""[out:json][timeout:240];
(
  way["highway"~"^(path|footway|track|steps|bridleway)$"]["name"]{bb};
  way["waterway"~"^(river|stream)$"]{bb};
  way["highway"~"^(primary|secondary|tertiary|unclassified|residential)$"]{bb};
  node["natural"~"^(peak|saddle|spring|arch)$"]{bb};
  node["tourism"~"^(camp_site|viewpoint|alpine_hut|wilderness_hut|hotel)$"]{bb};
  way["tourism"~"^(camp_site|hotel)$"]{bb};
  node["amenity"~"^(shelter|drinking_water|ranger_station)$"]{bb};
  node["man_made"="bridge"]{bb};
  node["bridge"]{bb};
  node["place"]{bb};
);
out body; >; out skel qt;"""
for ep in ["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter"]:
    try:
        r = requests.post(ep, data={"data": q}, timeout=300, headers={"User-Agent": "grand-canyon-trail-map/1.0 (personal cartography project)"})
        print(ep, r.status_code, len(r.content))
        if r.status_code == 200:
            d = r.json(); break
    except Exception as e:
        print("fail", ep, e)
else:
    sys.exit(1)
json.dump(d, open("osm.json","w"))
els = d["elements"]
from collections import Counter
print("elements", len(els), Counter(e["type"] for e in els))
names = Counter()
for e in els:
    t = e.get("tags",{})
    if e["type"]=="way" and "name" in t:
        names[(t.get("highway") or t.get("waterway") or t.get("tourism"), t["name"])] += 1
for k,v in sorted(names.items()): print(k, v)
print("--- nodes with tags")
for e in els:
    t = e.get("tags",{})
    if e["type"]=="node" and t:
        print(t.get("natural") or t.get("tourism") or t.get("amenity") or t.get("man_made") or t.get("place"), "|", t.get("name"), "|", t.get("ele"), e["lat"], e["lon"])
