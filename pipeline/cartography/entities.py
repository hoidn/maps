"""Conservative display repetition for authored aliases, never a catalog merge.

Only explicit campsite/trailhead roles and their terminal abbreviations qualify.
A unique source point must lie within ten geodesic metres of the authored feature
anchor. Areas keep their existing exact-name repetition; no point/area proximity
merge is inferred. Source identity, geometry, names and priorities are untouched.
"""
from collections import defaultdict
from pyproj import Geod

RULE='semantic-suffix-and-unique-point-within-10m-v1'
SUFFIXES={'camp':frozenset(('cg','camp','campground')),
          'th':frozenset(('th','trailhead'))}


def normalized_name(text,role):
 tokens=text.casefold().split()
 if tokens and tokens[-1].rstrip('.') in SUFFIXES[role]:tokens.pop()
 return tuple(tokens)


def source_role(feature):
 tags=feature.get('tags',{})
 roles=[]
 if tags.get('tourism')=='camp_site':roles.append('camp')
 if tags.get('highway')=='trailhead':roles.append('th')
 return roles[0] if len(roles)==1 else None


def match_display_repeats(manifest,features,spec):
 """Change only authored point-label repeat identity; report inferred evidence."""
 report={'rule':RULE,'maxDistanceMeters':10,'matched':[],'ambiguous':[]}
 sources={f['id']:f for f in features}
 roles=defaultdict(set)
 for a in manifest.annotations:
  if a['kind']=='symbol':roles[a['featureId']].add(a['symbolKind'])
 points=defaultdict(dict)
 labels=[a for a in manifest.annotations if a['kind']=='point-label']
 for a in labels:
  feature=manifest.features[a['featureId']]
  source=sources.get(feature.get('sourceId'))
  if source is None or source['geometry']['type']!='Point':continue
  role=source_role(source)
  if role is None:continue
  name=normalized_name(a['text'],role)
  if name:points[(role,name)][source['id']]=(a,source)
 geod=Geod(ellps='WGS84')
 for a in labels:
  feature=manifest.features[a['featureId']]
  if feature.get('sourceId') is not None:continue
  # A campground may also have an authored water marker at the same anchor.
  # Only the two supported destination roles compete for this label match.
  explicit_roles=roles[a['featureId']] & SUFFIXES.keys()
  if len(explicit_roles)!=1:continue
  role=next(iter(explicit_roles))
  if role not in SUFFIXES:continue
  name=normalized_name(a['text'],role)
  if not name:continue
  latitude,longitude=spec.unproject(*feature['anchor'])
  candidates=[]
  for source_id,(other,source) in points.get((role,name),{}).items():
   lon,lat=source['geometry']['coordinates'][:2]
   distance=geod.inv(longitude,latitude,lon,lat)[2]
   if distance<=10:candidates.append((source_id,other,distance))
  if len(candidates)>1:
   report['ambiguous'].append({'annotationId':a['id'],'featureId':feature['id'],'sourceIds':sorted(c[0] for c in candidates)})
  elif len(candidates)==1:
   source_id,other,distance=candidates[0]
   evidence={'rule':RULE,'confidence':'inferred-display-alias','sourceId':source_id,
             'sourceFeatureId':other['featureId'],'sourceAnnotationId':other['id'],
             'distanceMeters':round(distance,3),'semanticRole':role,
             'originalRepeatGroup':a['repeatGroup']}
   a['repeatGroup']=other['repeatGroup']
   a['displayRepeatMatch']=evidence
   report['matched'].append({'annotationId':a['id'],'featureId':feature['id'],**evidence})
 return report
