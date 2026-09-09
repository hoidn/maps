"""Versioned 3DHP service extraction, retaining GNIS and mainstem identities."""
from pathlib import Path
from .agency import fetch_layer,esri_geometry
BASE='https://3dhp.nationalmap.gov/arcgis/rest/services/usgs_3dhp_all/FeatureServer'
def fetch(spec,root):
 result=[]
 for layer,kind in ((50,'waterway'),(60,'waterbody')):
  data=fetch_layer(f'{BASE}/{layer}',spec,Path(root)/f'3dhp-{layer}.json','USGS 3DHP')
  for f in data['features']:
   a=f['attributes'];source_id=str(a.get('id3dhp') or a['OBJECTID']);gid=str(a.get('gnisid') or '')
   result.append({'id':f'3dhp:{layer}:{source_id}','provider':'3dhp','sourceId':source_id,'kind':kind,'name':a.get('gnisidlabel') or None,'geometry':esri_geometry(f['geometry']),'properties':{**a,'gnisId':gid,'intermittent':None},'tags':a})
 return result
