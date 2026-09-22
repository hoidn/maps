"""Complete, area-selected OSM acquisition with source metadata and explicit refresh."""
import json,math,shutil,time
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
 bounds=query_bounds(spec);merged={};requests_used=[];snapshot=None;first=None;preferred=ENDPOINTS[0]
 def download(bbox,name,depth=0):
  nonlocal preferred
  known_relations=sorted(identity for kind,identity in merged if kind=='relation')
  query=overpass_query(spec,bbox=bbox,snapshot=snapshot,exclude_relations=known_relations)
  print(f'OSM partition {name}: {bbox}',flush=True)
  part=parts/(name+'.json');metadata=part.with_name(part.name+'.source.json');split=parts/(name+'.split.json')
  split_record=json.loads(split.read_text()) if split.exists() else {}
  divided=split_record.get('query')==query and split_record.get('fullBbox')==list(spec.overpass_bbox)
  if not divided:
   record=json.loads(metadata.read_text()) if part.exists() and metadata.exists() else {}
   if record.get('query')==query and record.get('fullBbox')==list(spec.overpass_bbox):
    if not verify_source(part,record):raise ValueError('OSM checkpoint hash mismatch: '+str(part))
    data=json.loads(part.read_text())
    if datetime.fromisoformat(data['osm3s']['timestamp_osm_base'].replace('Z','+00:00'))<datetime.fromisoformat(record['datasetVersion'].replace('Z','+00:00')):raise ValueError('OSM checkpoint predates requested snapshot: '+str(part))
    preferred=record['url']
    print('Resuming verified OSM partition at snapshot '+record['datasetVersion'],flush=True)
    yield data,record,bbox
    return
   errors=[];overloaded=[]
   for endpoint in sorted(ENDPOINTS,key=lambda endpoint:endpoint!=preferred):
    try:
     for attempt in range(3):
      r=requests.post(endpoint,data={'data':query},headers={'User-Agent':'grand-canyon-trail-maps/1.0 (standalone cartographic map generation)'},timeout=240)
      if r.status_code!=429 or attempt==2:break
      try:delay=float(r.headers.get('Retry-After',30))
      except (TypeError,ValueError):delay=30
      delay=max(1,min(60,delay)) if math.isfinite(delay) else 30
      print(f'OSM endpoint rate limited; retrying after {delay:g}s',flush=True);time.sleep(delay)
     r.raise_for_status();data=r.json()
     if not isinstance(data,dict) or not isinstance(data.get('elements'),list):raise ValueError('Malformed OSM response')
     if data.get('remark'):raise ValueError(data['remark'])
     if any(not isinstance(e,dict) or e.get('type') not in ('node','way','relation') or type(e.get('id')) is not int for e in data['elements']):raise ValueError('Malformed OSM element')
     stamp=data.get('osm3s',{}).get('timestamp_osm_base')
     if not isinstance(stamp,str):raise ValueError('Missing OSM snapshot timestamp')
     server_time=datetime.fromisoformat(stamp.replace('Z','+00:00'))
     if snapshot and server_time<datetime.fromisoformat(snapshot.replace('Z','+00:00')):raise ValueError('OSM endpoint snapshot '+stamp+' predates requested snapshot '+snapshot)
     break
    except (requests.RequestException,ValueError) as error:
     errors.append(endpoint+': '+str(error));print(errors[-1],flush=True)
     overloaded.append(isinstance(error,requests.Timeout) or getattr(getattr(error,'response',None),'status_code',None) in (429,502,503,504) or 'timed out' in str(error).lower() or 'out of memory' in str(error).lower())
   else:
    if depth>=2 or not all(overloaded):raise RuntimeError('OSM acquisition failed in partition '+name+': '+'; '.join(errors))
    atomic_json(split,{'query':query,'fullBbox':list(spec.overpass_bbox),'errors':errors});divided=True
   if not divided:
    atomic_json(part,data)
    record=record_source(part,provider='OpenStreetMap',url=endpoint,retrieved_at=utc_now(),dataset_version=snapshot or stamp,bbox=(bbox[1],bbox[0],bbox[3],bbox[2]),attribution='© OpenStreetMap contributors, ODbL')
    record.update(query=query,fullBbox=list(spec.overpass_bbox),serverSnapshot=stamp);atomic_json(metadata,record)
    preferred=endpoint
    yield data,record,bbox
    return
  south,west,north,east=bbox;latitude=(south+north)/2;longitude=(west+east)/2
  print('Subdividing overloaded OSM partition '+name,flush=True)
  for index,child in enumerate(((south,west,latitude,longitude),(south,longitude,latitude,east),(latitude,west,north,longitude),(latitude,longitude,north,east))):
   yield from download(child,name+'-'+str(index),depth+1)
 for index,bbox in enumerate(bounds):
  for data,record,actual_bbox in download(bbox,f'{index:04d}'):
   if first is None:first=data;snapshot=record['datasetVersion']
   for element in data['elements']:
    key=(element['type'],element['id'])
    if key in merged and merged[key]!=element:raise ValueError('Conflicting OSM object at fixed snapshot: '+str(key))
    merged[key]=element
   requests_used.append({'bbox':list(actual_bbox),'url':record['url'],'query':record['query'],'retrievedAt':record['retrievedAt'],'serverSnapshot':record['serverSnapshot'],'elements':len(data['elements'])})
   print(f'OSM frame partition {index+1}/{len(bounds)}: {len(data["elements"])} elements, {len(merged)} unique',flush=True)
 if not merged:raise ValueError('Empty OSM acquisition')
 # Never replace a prior cache with incomplete ways or recursive relation members.
 for element in merged.values():
  refs=[('node',ref) for ref in element.get('nodes',[])] if element['type']=='way' else [(member['type'],member['ref']) for member in element.get('members',[])] if element['type']=='relation' else []
  for ref in refs:
   if ref not in merged:raise ValueError('Missing OSM dependency: '+str(ref))
 result={**first,'elements':list(merged.values()),'acquisition':{'bbox':list(spec.overpass_bbox),'snapshot':snapshot,'requests':requests_used}}
 atomic_json(path,result)
 record_source(path,provider='OpenStreetMap',url=requests_used[0]['url'],retrieved_at=utc_now(),dataset_version=snapshot,bbox=spec.bbox,attribution='© OpenStreetMap contributors, ODbL')
 shutil.rmtree(parts)
 return result
