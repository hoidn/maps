"""Supplement OSM hydro with USGS coverage outside a conservative overlap corridor."""
from copy import deepcopy
from shapely.geometry import shape,mapping
from shapely.ops import transform,unary_union
from shapely import STRtree

def hydro_style(f):
 t=f.get('tags',{});p=f.get('properties',{});v=t.get('intermittent',p.get('intermittent'))
 intermittent=True if v in ('yes',True) else False if v in ('no',False) else None
 river=t.get('waterway')=='river' or (p.get('streamorder') or 0)>=5
 return {'intermittent':intermittent,'width':1.8 if river else .7,'dash':[4,3] if intermittent else [],'class':'river' if river else 'stream','flowStatus':'intermittent' if intermittent else 'perennial' if intermittent is False else 'unknown'}

def combine_hydro(osm,national,spec,tolerance_m=18):
 result=deepcopy(osm);report={'clippedOverlap':0,'duplicates':[],'supplemented':0,'toleranceMeters':tolerance_m}
 to_metric=lambda x,y,z=None:spec._forward.transform(x,y)
 to_geo=lambda x,y,z=None:spec._inverse.transform(x,y)
 existing=[(f,transform(to_metric,shape(f['geometry']))) for f in osm]
 buffers=[g.buffer(tolerance_m) for _,g in existing];index=STRtree(buffers)
 for source in national:
  f=deepcopy(source);g=transform(to_metric,shape(f['geometry']));matches=[]
  for i in index.query(g,predicate='intersects'):
   other,og=existing[i]
   if other['kind']!=f['kind']:continue
   name=f.get('name');other_name=other.get('name')
   if name and other_name and name.casefold()!=other_name.casefold():continue
   gid=f.get('properties',{}).get('gnisId');oid=other.get('properties',{}).get('gnisId') or other.get('tags',{}).get('gnis:feature_id')
   same_id=bool(gid and oid and str(gid)==str(oid))
   if f['kind']=='waterbody':
    corresponding=g.intersection(og).area/max(1,min(g.area,og.area))>.85
   else:
    shorter,longer=(g,og) if g.length<og.length else (og,g)
    corresponding=shorter.length>=100 and shorter.intersection(longer.buffer(tolerance_m)).length/shorter.length>.85
   if same_id or corresponding:matches.append(og)
  mask=unary_union(matches).buffer(tolerance_m) if matches else None
  if mask is not None and g.intersects(mask):
   report['clippedOverlap']+=1;g=g.difference(mask)
   if g.is_empty:report['duplicates'].append(f['id']);continue
   f['geometryProcessing']={'operation':'remove OSM overlap corridor','meters':tolerance_m,'sourceGeometryRetainedInCache':True}
  if g.is_empty:continue
  f['geometry']=mapping(transform(to_geo,g));result.append(f);report['supplemented']+=1
 return result,report
