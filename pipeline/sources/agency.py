"""Paginated public ArcGIS extraction; identifiers are fetched before feature batches."""
import requests
from shapely.geometry import Polygon,MultiPolygon,LinearRing,mapping
from shapely.ops import unary_union
from shapely import make_valid
from shapely.validation import explain_validity
from .catalog import atomic_json,record_source,utc_now
HEADERS={'User-Agent':'grand-canyon-trail-maps/1.0 (standalone cartographic map generation)'}
def esri_geometry(g, *, repairs=None):
 """Convert ESRI geometry. Optional repairs records explicit polygon normalization.

 Holes belong to the smallest enclosing shell, so islands inside holes survive.
 Invalid source rings are rejected unless the caller requests a repair log.
 GEOS make_valid preserves polygon components without the lossy buffer(0) trick.
 """
 if 'x' in g:return {'type':'Point','coordinates':[g['x'],g['y']]}
 if 'points' in g:
  points=[list(p[:2]) for p in g['points']]
  if not points:raise ValueError('Empty source multipoint')
  return {'type':'Point','coordinates':points[0]} if len(points)==1 else {'type':'MultiPoint','coordinates':points}
 if 'paths' in g:return {'type':'MultiLineString','coordinates':[[list(p[:2]) for p in line] for line in g['paths']]}
 if 'rings' in g:
  outer=[];inner=[]
  for index,coords in enumerate(g['rings']):
   points=[p[:2] for p in coords];poly=Polygon(points)
   target=inner if LinearRing(points).is_ccw else outer
   if not poly.is_valid:
    reason=explain_validity(poly)
    if repairs is None:raise ValueError('Invalid source polygon: '+reason)
    fixed=make_valid(poly)
    parts=[]
    def polygons(v):
     if v.geom_type=='Polygon':parts.append(v)
     elif hasattr(v,'geoms'):
      for part in v.geoms:polygons(part)
    polygons(fixed)
    if not parts:raise ValueError('Repair produced no polygon area')
    repaired=unary_union(parts)
    repairs.append({'ring':index,'reason':reason,'method':'GEOS make_valid; polygon components retained', 'beforeAreaDegrees2':poly.area,'afterAreaDegrees2':repaired.area,'discardedNonArea':fixed.geom_type=='GeometryCollection'})
    target.extend(parts)
   else:target.append(poly)
  if not outer:raise ValueError('Polygon has no outer ring')
  holes=[[] for _ in outer]
  for hole in inner:
   containers=[i for i,shell in enumerate(outer) if shell.covers(hole)]
   if not containers:raise ValueError('Polygon hole outside outer ring')
   holes[min(containers,key=lambda i:outer[i].area)].append(hole)
  # Ring validity alone does not establish that shells and holes form a valid
  # multipart polygon: overlapping shells/holes would otherwise be silently
  # dissolved by the following boolean operations.
  assembled=MultiPolygon([Polygon(shell.exterior.coords,[list(r.coords) for r in shell.interiors]+[list(h.exterior.coords) for h in holes[i]]) for i,shell in enumerate(outer)])
  reason=explain_validity(assembled) if not assembled.is_valid else None
  if reason and repairs is None:raise ValueError('Invalid assembled polygon: '+reason)
  result=unary_union([shell.difference(unary_union(holes[i])) for i,shell in enumerate(outer)])
  if reason:repairs.append({'scope':'assembled polygon','reason':reason,'method':'Explicit shell union and hole subtraction','beforeAreaDegrees2':assembled.area,'afterAreaDegrees2':result.area,'discardedNonArea':False})
  if not result.is_valid:raise ValueError('Invalid normalized assembled polygon: '+explain_validity(result))
  return mapping(result)
 raise ValueError('Unsupported source geometry')
def request_json(url,params):
 r=requests.get(url,params=params,headers=HEADERS,timeout=90);r.raise_for_status();d=r.json()
 if 'error' in d:raise ValueError(str(d['error']))
 return d

def query_layer(url,spec,*,where='1=1'):
 meta=request_json(url,{'f':'json'});w,s,e,n=spec.bbox
 q={'f':'json','where':where,'geometry':f'{w},{s},{e},{n}','geometryType':'esriGeometryEnvelope','inSR':4326,'spatialRel':'esriSpatialRelIntersects','returnIdsOnly':'true'}
 ids=request_json(url+'/query',q).get('objectIds') or [];features=[]
 oid=meta.get('objectIdField') or meta.get('objectIdFieldName') or next((f['name'] for f in meta.get('fields',[]) if f.get('type')=='esriFieldTypeOID'),None)
 if len(ids)!=len(set(ids)):raise ValueError('Duplicate agency identity in source query')
 for i in range(0,len(ids),200):
  data=request_json(url+'/query',{'f':'json','objectIds':','.join(map(str,ids[i:i+200])),'outFields':'*','outSR':4326,'returnGeometry':'true','returnZ':'false','returnM':'false'})
  batch=data.get('features',[])
  if data.get('exceededTransferLimit') or len(batch)!=len(ids[i:i+200]):raise ValueError('Incomplete agency feature batch')
  actual=[f.get('attributes',{}).get(oid) for f in batch]
  if len(set(actual))!=len(actual) or set(actual)!=set(ids[i:i+200]):raise ValueError('Incomplete agency feature identity batch')
  features.extend(batch)
 return {'metadata':meta,'features':features,'count':len(ids),'bbox':list(spec.bbox)}
def fetch_layer(url,spec,path,provider):
 data=query_layer(url,spec);atomic_json(path,data)
 record_source(path,provider=provider,url=url,retrieved_at=utc_now(),dataset_version=data['metadata'].get('editingInfo',{}).get('lastEditDate') or data['metadata'].get('copyrightText') or 'service snapshot; survey date varies',bbox=spec.bbox)
 return data
