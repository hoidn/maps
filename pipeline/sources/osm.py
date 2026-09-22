"""Complete, area-selected OSM acquisition with source metadata and explicit refresh."""
import json,math,shutil
from pathlib import Path
from datetime import datetime
import requests
from .catalog import atomic_json,record_source,utc_now,verify_source
ENDPOINTS=('https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter')
def query_bounds(spec):
 """Cover the buffered frame with bounded requests; members remain complete."""
 south,west,north,east=spec.overpass_bbox
 rows=math.ceil((north-south)/.1);columns=math.ceil((east-west)/.1)
 latitudes=[south+(north-south)*row/rows for row in range(rows)]+[north]
 longitudes=[west+(east-west)*column/columns for column in range(columns)]+[east]
 return [(latitudes[row],longitudes[column],latitudes[row+1],longitudes[column+1])
         for row in range(rows) for column in range(columns)]

def overpass_query(spec,*,bbox=None,snapshot=None,exclude_relations=()):
 bbox=','.join(str(v) for v in (bbox or spec.overpass_bbox))
 selectors=['["highway"]','["ford"]','["waterway"]','["natural"]','["landuse"~"^(forest|meadow|grass|recreation_ground)$"]','["building"]','["amenity"]','["tourism"]','["shop"]','["leisure"]','["historic"]','["place"]','["barrier"]','["railway"]','["public_transport"]','["boundary"~"^(national_park|protected_area)$"]','["type"="route"]["route"~"^(hiking|foot|bicycle|bus)$"]']
 excluded='(._;-rel(id:'+','.join(map(str,exclude_relations))+'););' if exclude_relations else ''
 return '[out:json][timeout:180]'+(f'[date:"{snapshot}"]' if snapshot else '')+';('+''.join(f'nwr{tag}({bbox});' for tag in selectors)+');'+excluded+'(._;>>;);out body qt;'
def fetch(spec,path):
 path=Path(path);parts=path.with_name(path.stem+'-parts')
 bounds=query_bounds(spec);merged={};requests_used=[];snapshot=None;first=None
 for index,bbox in enumerate(bounds,1):
  known_relations=sorted(identity for kind,identity in merged if kind=='relation')
  query=overpass_query(spec,bbox=bbox,snapshot=snapshot,exclude_relations=known_relations);errors=[]
  print(f'OSM partition {index}/{len(bounds)}: {bbox}',flush=True)
  part=parts/f'{index-1:04d}.json';metadata=part.with_name(part.name+'.source.json')
  record=json.loads(metadata.read_text()) if part.exists() and metadata.exists() else {}
  if record.get('query')==query and record.get('fullBbox')==list(spec.overpass_bbox):
   if not verify_source(part,record):raise ValueError('OSM checkpoint hash mismatch: '+str(part))
   data=json.loads(part.read_text());stamp=record['serverSnapshot'];endpoint=record['url']
   print('Resuming verified OSM partition at snapshot '+record['datasetVersion'],flush=True)
  else:
   for endpoint in ENDPOINTS:
    try:
     r=requests.post(endpoint,data={'data':query},headers={'User-Agent':'grand-canyon-trail-maps/1.0 (standalone cartographic map generation)'},timeout=240);r.raise_for_status();data=r.json()
     if not isinstance(data,dict) or not isinstance(data.get('elements'),list):raise ValueError('Malformed OSM response')
     if data.get('remark'):raise ValueError(data['remark'])
     if any(not isinstance(e,dict) or e.get('type') not in ('node','way','relation') or type(e.get('id')) is not int for e in data['elements']):raise ValueError('Malformed OSM element')
     stamp=data.get('osm3s',{}).get('timestamp_osm_base')
     if not isinstance(stamp,str):raise ValueError('Missing OSM snapshot timestamp')
     datetime.fromisoformat(stamp.replace('Z','+00:00'))
     break
    except (requests.RequestException,ValueError) as error:
     errors.append(endpoint+': '+str(error));print(errors[-1],flush=True)
   else:raise RuntimeError(f'OSM acquisition failed in partition {index}/{len(bounds)}: '+'; '.join(errors))
   atomic_json(part,data)
   record=record_source(part,provider='OpenStreetMap',url=endpoint,retrieved_at=utc_now(),dataset_version=snapshot or stamp,bbox=(bbox[1],bbox[0],bbox[3],bbox[2]),attribution='© OpenStreetMap contributors, ODbL')
   record.update(query=query,fullBbox=list(spec.overpass_bbox),serverSnapshot=stamp);atomic_json(metadata,record)
  if first is None:first=data;snapshot=stamp
  for element in data['elements']:
   key=(element['type'],element['id'])
   if key in merged and merged[key]!=element:raise ValueError('Conflicting OSM object at fixed snapshot: '+str(key))
   merged[key]=element
  requests_used.append({'bbox':list(bbox),'url':endpoint,'query':query,'retrievedAt':record['retrievedAt'],'serverSnapshot':stamp,'elements':len(data['elements'])})
  print(f'OSM partition {index}/{len(bounds)}: {len(data["elements"])} elements, {len(merged)} unique',flush=True)
 if not merged:raise ValueError('Empty OSM acquisition')
 # A successful response must include complete ways and recursive relation members.
 # Do not replace a prior cache with a geographically incomplete partial refresh.
 for element in merged.values():
  refs=[('node',ref) for ref in element.get('nodes',[])] if element['type']=='way' else [(member['type'],member['ref']) for member in element.get('members',[])] if element['type']=='relation' else []
  for ref in refs:
   if ref not in merged:raise ValueError('Missing OSM dependency: '+str(ref))
 result={**first,'elements':list(merged.values()),'acquisition':{'bbox':list(spec.overpass_bbox),'snapshot':snapshot,'requests':requests_used}}
 atomic_json(path,result)
 record_source(path,provider='OpenStreetMap',url=requests_used[0]['url'],retrieved_at=utc_now(),dataset_version=snapshot,bbox=spec.bbox,attribution='© OpenStreetMap contributors, ODbL')
 shutil.rmtree(parts)
 return result
