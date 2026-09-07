"""Second OpenStreetMap pull: hiking route relations plus every path in the corridor box.

Needed because the North Kaibab Trail's main ways are tagged highway=construction
(transcanyon waterline work), which the highway=path|footway filter in fetch_osm.py
misses, and because the Rim Trail and Tonto Trail are only complete as relations."""
import requests, json
from collections import Counter
q = """[out:json][timeout:240];
(
  rel["route"~"^(hiking|foot)$"]["name"~"Kaibab|Rim Trail|Bright Angel|Tonto|Hermit|Grandview|Clear Creek|Widforss|Ken Patrick|Uncle Jim|Transept"](35.99,-112.262,36.232,-111.898);
  way["highway"~"^(path|footway|track|steps|bridleway)$"](36.100,-112.110,36.222,-112.020);
  way["highway"~"^(path|footway|steps)$"](36.050,-112.112,36.066,-112.078);
);
(._;>;);
out body;"""
r = requests.post("https://overpass-api.de/api/interpreter", data={"data": q}, timeout=300,
                  headers={"User-Agent": "grand-canyon-trail-map/1.0 (personal cartography project)"})
r.raise_for_status()
d = r.json(); json.dump(d, open("osm2.json", "w"))
print(Counter(e["type"] for e in d["elements"]))
for e in d["elements"]:
    if e["type"] == "relation": print("relation", e["tags"].get("name"), len(e["members"]), "members")
