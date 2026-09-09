"""Protected-area designations remain separate from ownership/management categories."""
from pathlib import Path
from .agency import fetch_layer,esri_geometry
URL='https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/Manager_Name_PADUS/FeatureServer/0'
def fetch(spec,root):
 data=fetch_layer(URL,spec,Path(root)/'padus.json','USGS PAD-US 4.1');result=[];issues=[]
 for f in data['features']:
  a=f['attributes'];lower={k.lower():v for k,v in a.items()};identity=str(lower.get('unit_id') or lower.get('objectid'))
  repairs=[]
  try:g=esri_geometry(f['geometry'],repairs=repairs)
  except ValueError as e:issues.append({'id':identity,'reason':str(e)});continue
  result.append({'id':'padus:'+identity,'provider':'padus','sourceId':identity,'kind':'boundary','name':lower.get('unit_nm') or lower.get('loc_nm') or lower.get('own_name'),'geometry':g,'properties':{**a,'category':lower.get('category'),'designation':lower.get('des_tp'),'manager':lower.get('mang_name'),'geometryRepairs':repairs},'tags':a})
 return result,issues
