"""Portable text hierarchy, independent of geometry and symbol visibility.

Scores are cartographic priorities, not popularity or a claim of prominence.
Unknown topographic prominence is not inferred from elevation or spelling.
"""
import math
TEXT_KINDS={'point-label','line-label','region-label','edge-pointer'}
TIERS=((900,96),(800,48),(700,32),(600,12),(500,6),(0,3))

def text_importance(annotation,feature=None):
 if annotation.get('kind') not in TEXT_KINDS:return None
 a=annotation;style=a.get('style','');tags=(feature or {}).get('tags',{})
 score=a.get('priority',550);reason=a.get('priorityReason','secondary-feature')
 if a.get('requiredProfiles') or a.get('requiredGroup') or reason=='required-destination':
  return {'textImportance':1000,'textImportanceReason':'required-destination-or-route','textMaxMetersPerPixel':None}
 if a.get('distanceSegmentId'):score,reason=250,'junction-distance-detail'
 elif style.startswith('l-contour'):
  limit=3 if style=='l-contour-ff' else 6 if style=='l-contour-f' else 12
  return {'textImportance':380,'textImportanceReason':'contour-elevation','textMaxMetersPerPixel':limit}
 elif a.get('kind')=='region-label':score,reason=850,'regional-context'
 elif a.get('layer')=='boundaries':score,reason=650,'administrative-detail'
 elif style=='l-river':score,reason=850,'river-context'
 elif style=='l-hydro' and a.get('areaPolygons'):score,reason=820,'waterbody-context'
 elif style=='l-hydro':
  score=800 if a.get('featureLengthMeters',0)>=5000 else 720
  reason='long-waterway' if score==800 else 'waterway-name'
 elif style.startswith('l-trail'):
  score=820 if a.get('featureLengthMeters',0)>=5000 else 760
  reason='long-route' if score==820 else 'trail-name'
 elif style in ('l-road','l-road-major','l-road-ref'):
  from .transport import ROAD_RANK
  rank=ROAD_RANK.get(tags.get('highway'),0)
  score=820 if rank>=4 else 700 if rank>=2 else 600
  reason='major-road' if rank>=4 else 'local-road'
 elif style=='l-peak' or reason=='topographic-point':
  score,reason=620,'topographic-point-unknown-prominence'
  try:prominence=float(tags.get('prominence'))
  except (TypeError,ValueError):prominence=None
  if prominence is not None and math.isfinite(prominence) and prominence>=100:
   score=900 if prominence>=600 else 800 if prominence>=300 else 700
   reason='source-prominence'
 limit=next(limit for minimum,limit in TIERS if score>=minimum)
 return {'textImportance':score,'textImportanceReason':reason,'textMaxMetersPerPixel':limit}

def apply_text_importance(manifest,features):
 by_source={f['id']:f for f in features};counts={}
 for a in manifest.annotations:
  source_id=a.get('sourceId') or manifest.features[a['featureId']].get('sourceId')
  values=text_importance(a,by_source.get(source_id))
  if values is None:continue
  a.update(values);a['priority']=values['textImportance']
  reason=values['textImportanceReason'];counts[reason]=counts.get(reason,0)+1
 return {'policyVersion':1,'scope':'text-only','tiers':[{'minimumScore':s,'maximumMetersPerPixel':m} for s,m in TIERS],'reasonCounts':counts}
