"""Official natural/populated names; historical/retired administrative layers omitted.

 The map service joins some names to multiple counties. Normalize by GNIS identity
 while retaining all source points and object IDs, never arbitrarily placing a
 long river or broad landform at its first point outside the requested region.
 """
from pathlib import Path
from .agency import fetch_layer,esri_geometry
BASE='https://carto.nationalmap.gov/arcgis/rest/services/geonames/MapServer'
LAYERS=(3,5,6,7)
def normalize(layers):
 result={}
 for layer,data in layers:
  for f in data['features']:
   a=f['attributes'];gid=str(a['gaz_id']);geometry=esri_geometry(f['geometry'])
   if gid not in result:
    result[gid]={'id':'gnis:'+gid,'provider':'gnis','sourceId':gid,'kind':'poi','name':a['gaz_name'],'geometry':geometry,'properties':{'featureClass':a['gaz_featureclass'],'gnisId':gid,'sourceLayers':[],'sourceObjectIds':[]},'tags':a}
   item=result[gid]
   if item['name']!=a['gaz_name'] or item['properties']['featureClass']!=a['gaz_featureclass']:raise ValueError('Conflicting GNIS attributes for '+gid)
   def points(g):return [g['coordinates']] if g['type']=='Point' else g['coordinates']
   unique=list(dict.fromkeys(tuple(p) for p in points(item['geometry'])+points(geometry)))
   item['geometry']={'type':'Point','coordinates':list(unique[0])} if len(unique)==1 else {'type':'MultiPoint','coordinates':[list(p) for p in unique]}
   if layer not in item['properties']['sourceLayers']:item['properties']['sourceLayers'].append(layer)
   oid=a.get('OBJECTID')
   if oid not in item['properties']['sourceObjectIds']:item['properties']['sourceObjectIds'].append(oid)
 return list(result.values())
def fetch(spec,root):
 return normalize([(layer,fetch_layer(f'{BASE}/{layer}',spec,Path(root)/f'gnis-{layer}.json','USGS GNIS')) for layer in LAYERS])
