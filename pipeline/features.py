"""Portable WGS84 feature catalog. GeoJSON uses longitude/latitude; node identity
and original tags survive normalization. No region names influence selection.
"""
from collections import defaultdict,Counter
from shapely.geometry import Point,LineString,Polygon,MultiPolygon,mapping,box
from shapely.ops import unary_union
from water_areas import rings

def display_name(tags):
 name=tags.get('name') or tags.get('name:en')
 return name.strip() if name and name.strip() not in ('?','unknown','unnamed') else None

def feature_kind(t):
 if t.get('highway') in ('trailhead','bus_stop','crossing','ford') or t.get('waterway')=='waterfall' or (not t.get('highway') and t.get('ford') not in (None,'no')):return 'poi'
 if t.get('highway'):
  h=t.get('construction') if t['highway']=='construction' else t['highway']
  return 'trail' if h in ('path','footway','steps','bridleway','cycleway','pedestrian') else 'road'
 if t.get('natural')=='water' or t.get('waterway')=='riverbank':return 'waterbody'
 if t.get('waterway') in ('river','stream','canal','ditch','drain'):return 'waterway'
 if t.get('boundary') in ('protected_area','national_park','administrative'):return 'boundary'
 if t.get('building') not in (None,'no'):return 'building'
 if t.get('natural') in ('wood','scrub','grassland','heath','wetland','glacier','bare_rock','sand') or t.get('landuse') in ('forest','meadow','grass','recreation_ground'):return 'landcover'
 if t.get('leisure')=='picnic_table':return 'poi'
 if t.get('barrier') in ('fence','wall','retaining_wall','hedge','city_wall'):return 'barrier'
 if any(k in t for k in ('amenity','tourism','shop','historic','place','barrier','public_transport')) or t.get('natural') in ('peak','saddle','spring','waterfall','cave_entrance','arch','tree'):return 'poi'
 if t.get('railway') in ('rail','narrow_gauge','light_rail','tram','abandoned'):return 'railway'
 return None

def feature_roles(tags,kind=None):
 """A facility inside a building retains both roles under one source identity."""
 kind=kind or feature_kind(tags)
 roles=[kind] if kind else []
 if kind=='building' and any(tags.get(key) not in (None,'','no') for key in ('amenity','tourism','shop','historic','public_transport')):roles.append('poi')
 return roles

def assemble_area(outer,inner):
 holes=[[] for _ in outer]
 for hole in inner:
  containers=[i for i,shell in enumerate(outer) if shell.covers(hole)]
  if not containers:raise ValueError('Polygon hole outside outer ring')
  holes[min(containers,key=lambda i:outer[i].area)].append(hole.exterior.coords)
 g=MultiPolygon([Polygon(shell.exterior.coords,holes[i]) for i,shell in enumerate(outer)])
 if not g.is_valid:raise ValueError('Invalid polygon topology')
 return g

def catalog_from_osm(elements,spec):
 merged={}
 for e in elements:
  key=(e['type'],e['id']);old=merged.get(key)
  if old is None or e.get('version',0)>=old.get('version',0):merged[key]=e
 nodes={e['id']:(e['lon'],e['lat']) for e in merged.values() if e['type']=='node'}
 ways={e['id']:e for e in merged.values() if e['type']=='way'}
 relations=[e for e in merged.values() if e['type']=='relation'];memberships=defaultdict(list);routes=[];issues=[];features=[];used=set();frame=box(*spec.bbox)
 def coordinates(ids):
  try:return [nodes[i] for i in ids]
  except KeyError as e:raise ValueError('Missing OSM node '+str(e.args[0])) from e
 for r in relations:
  t=r.get('tags',{})
  if t.get('type')=='route':
   rid=f'osm:relation:{r["id"]}';route={'id':rid,'name':display_name(t),'tags':t,'members':r.get('members',[])};routes.append(route)
   for m in r.get('members',[]):
    if m['type']=='way':memberships[m['ref']].append(rid)
 def add(e,g,kind):
  if g.is_empty or not g.intersects(frame):return
  t=dict(e.get('tags',{}));identity=f'osm:{e["type"]}:{e["id"]}'
  features.append({'id':identity,'provider':'osm','sourceId':identity,'kind':kind,'roles':feature_roles(t,kind),'name':display_name(t),'geometry':mapping(g),'tags':t,'properties':dict(t),'nodeIds':e.get('nodes',[]),'routeIds':memberships.get(e['id'],[]) if e['type']=='way' else []})
 for r in relations:
  t=r.get('tags',{});kind=feature_kind(t)
  if t.get('type') not in ('multipolygon','boundary') or kind is None:continue
  try:
   roles={'outer':[],'inner':[]};ids=[]
   for m in r.get('members',[]):
    if m['type']!='way' or m.get('role','') not in ('','outer','inner'):continue
    if m['ref'] not in ways:raise ValueError('Missing OSM polygon member')
    roles[m.get('role') or 'outer'].append(ways[m['ref']]['nodes']);ids.append(m['ref'])
   outer=[Polygon(coordinates(ring)) for ring in rings(roles['outer'])];inner=[Polygon(coordinates(ring)) for ring in rings(roles['inner'])]
   add(r,assemble_area(outer,inner),kind);used.update((i,kind) for i in ids)
  except ValueError as error:issues.append({'id':f'osm:relation:{r["id"]}','reason':str(error)})
 for w in ways.values():
  t=w.get('tags',{});kind=feature_kind(t)
  if kind is None or (w['id'],kind) in used:continue
  pts=coordinates(w.get('nodes',[]))
  if len(pts)<2:continue
  area=kind in ('waterbody','landcover','building','boundary') or t.get('area')=='yes'
  if area:
   if pts[0]!=pts[-1]:issues.append({'id':f'osm:way:{w["id"]}','reason':'Unclosed area'});continue
   g=Polygon(pts)
   if not g.is_valid:issues.append({'id':f'osm:way:{w["id"]}','reason':'Invalid area'});continue
  else:g=LineString(pts)
  add(w,g,kind)
 for e in merged.values():
  if e['type']=='node' and feature_kind(e.get('tags',{})) in ('poi','barrier'):add(e,Point(nodes[e['id']]),'poi')
 return {'version':1,'frame':spec.frame,'features':features,'routes':routes,'issues':issues,'counts':dict(Counter(f['kind'] for f in features))}
