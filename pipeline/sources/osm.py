"""Complete, area-selected OSM acquisition with source metadata and explicit refresh."""
import json,time
from pathlib import Path
import requests
from .catalog import atomic_json,record_source,utc_now
ENDPOINTS=('https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter')
def overpass_query(spec):
 bbox=','.join(str(v) for v in spec.overpass_bbox)
 selectors=['["highway"]','["ford"]','["waterway"]','["natural"]','["landuse"~"^(forest|meadow|grass|recreation_ground)$"]','["building"]','["amenity"]','["tourism"]','["shop"]','["leisure"]','["historic"]','["place"]','["barrier"]','["railway"]','["public_transport"]','["boundary"~"^(national_park|protected_area)$"]','["type"="route"]["route"~"^(hiking|foot|bicycle|bus)$"]']
 return '[out:json][timeout:180];('+''.join(f'nwr{tag}({bbox});' for tag in selectors)+');(._;>>;);out body qt;'
def fetch(spec,path):
 query=overpass_query(spec);errors=[]
 for endpoint in ENDPOINTS:
  try:
   r=requests.post(endpoint,data={'data':query},headers={'User-Agent':'grand-canyon-trail-maps/1.0 (standalone cartographic map generation)'},timeout=240);r.raise_for_status();data=r.json()
   if data.get('remark'):raise ValueError(data['remark'])
   if not isinstance(data.get('elements'),list) or not data['elements']:raise ValueError('Empty or malformed OSM response')
   atomic_json(path,data);record_source(path,provider='OpenStreetMap',url=endpoint,retrieved_at=utc_now(),dataset_version=data.get('osm3s',{}).get('timestamp_osm_base','unknown'),bbox=spec.bbox,attribution='© OpenStreetMap contributors, ODbL')
   return data
  except (requests.RequestException,ValueError) as e:errors.append(str(e))
 raise RuntimeError('OSM acquisition failed: '+'; '.join(errors))
