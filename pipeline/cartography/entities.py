"""Conservative display repetition for authored aliases, never a catalog merge.

Only compatible explicit point roles and complete normalized names qualify.
A unique matching source must be a point within ten geodesic metres or an area
covering the authored feature anchor. Source identity, geometry, names and
priorities are untouched; this changes display repetition only.
"""
from collections import defaultdict
from fractions import Fraction
import re
import unicodedata
from label_manifest import stable_id
from pyproj import Geod
from shapely.geometry import shape,Point

RULE='semantic-name-role-and-unique-point-or-containing-area-v3'
SUFFIXES={'camp':frozenset(('cg','camp','campground')),
          'th':frozenset(('th','trailhead')),
          'view':frozenset(), 'shelter':frozenset()}


FRACTIONS={c:Fraction(v) for c,v in [('½','1/2'),('¼','1/4'),('¾','3/4'),('⅓','1/3'),('⅔','2/3'),('⅛','1/8'),('⅜','3/8'),('⅝','5/8'),('⅞','7/8')]}

def normalized_name(text,role=None):
 # Preserve every semantic word. Numeric spellings share exact rational values;
 # a vulgar fraction following a whole number denotes a mixed number.
 text=re.sub(r'(\d*)(['+''.join(FRACTIONS)+'])',lambda m:str(Fraction(m[1] or '0')+FRACTIONS[m[2]])+' ',text)
 tokens=re.findall(r'(?:\d+\.\d*|\.\d+|\d+)(?:/\d+)?|[^\W\d_]+',unicodedata.normalize('NFKC',text).casefold())
 def number(t):
  if not(t[0].isdigit() or t.startswith('.')):return t
  try:return str(Fraction(t))
  except (ValueError,ZeroDivisionError):return t
 tokens=[number(t) for t in tokens]
 if role=='shelter':tokens=['resthouse' if t=='rest' and i+1<len(tokens) and tokens[i+1]=='house' else t for i,t in enumerate(tokens) if not(t=='house' and i and tokens[i-1]=='rest')]
 if tokens and tokens[-1] in SUFFIXES.get(role,()):tokens.pop()
 return tuple(tokens)


def source_role(feature):
 tags=feature.get('tags',{})
 roles=[]
 if tags.get('tourism')=='camp_site':roles.append('camp')
 if tags.get('highway')=='trailhead':roles.append('th')
 if tags.get('tourism')=='viewpoint':roles.append('view')
 if tags.get('amenity')=='shelter' or tags.get('tourism') in ('wilderness_hut','alpine_hut'):roles.append('shelter')
 return roles[0] if len(roles)==1 else None


def match_display_repeats(manifest,features,spec):
 """Change only authored point-label repeat identity; report inferred evidence."""
 report={'rule':RULE,'maxDistanceMeters':10,'matched':[],'ambiguous':[]}
 sources={f['id']:f for f in features}
 roles=defaultdict(set)
 for a in manifest.annotations:
  if a['kind']=='symbol':roles[a['featureId']].add(a['symbolKind'])
 destinations=defaultdict(dict)
 labels=[a for a in manifest.annotations if a['kind']=='point-label']
 for a in labels:
  feature=manifest.features[a['featureId']]
  source=sources.get(feature.get('sourceId'))
  if source is None or source['geometry']['type'] not in ('Point','Polygon','MultiPolygon'):continue
  role=source_role(source)
  if role is None:continue
  name=normalized_name(a['text'],role)
  if name:destinations[(role,name)][source['id']]=(a,source)
 geod=Geod(ellps='WGS84')
 for a in labels:
  feature=manifest.features[a['featureId']]
  if feature.get('sourceId') is not None:continue
  # A campground may also have an authored water marker at the same anchor.
  # Only compatible explicit destination roles compete for this label match.
  explicit_roles=roles[a['featureId']] & SUFFIXES.keys()
  if len(explicit_roles)!=1:continue
  role=next(iter(explicit_roles))
  if role not in SUFFIXES:continue
  name=normalized_name(a['text'],role)
  if not name:continue
  latitude,longitude=spec.unproject(*feature['anchor'])
  candidates=[]
  for source_id,(other,source) in destinations.get((role,name),{}).items():
   if source['geometry']['type']=='Point':
    lon,lat=source['geometry']['coordinates'][:2]
    distance=geod.inv(longitude,latitude,lon,lat)[2]
    if distance<=10:candidates.append((source_id,other,{'spatialEvidence':'point-within-10m','distanceMeters':round(distance,3)}))
   else:
    area=shape(source['geometry'])
    if area.is_valid and area.covers(Point(longitude,latitude)):
     candidates.append((source_id,other,{'spatialEvidence':'anchor-covered-by-source-area'}))
  if len(candidates)>1:
   report['ambiguous'].append({'annotationId':a['id'],'featureId':feature['id'],'sourceIds':sorted(c[0] for c in candidates)})
  elif len(candidates)==1:
   source_id,other,spatial=candidates[0]
   evidence={'rule':RULE,'confidence':'inferred-display-alias','sourceId':source_id,
             'sourceFeatureId':other['featureId'],'sourceAnnotationId':other['id'],
             **spatial,'semanticRole':role,
             'originalRepeatGroup':a['repeatGroup']}
   a['repeatGroup']=other['repeatGroup']
   a['displayRepeatMatch']=evidence
   report['matched'].append({'annotationId':a['id'],'featureId':feature['id'],**evidence})
 report['protectedAreas']=match_protected_area_repeats(manifest,features)
 return report


def protected_names(source):
 tags=source.get('tags',{});properties=source.get('properties',{})
 values=[source.get('name')]
 for data in (tags,properties):
  for key in ('name','official_name','alt_name','Unit_Nm','Loc_Nm'):values.extend(str(data.get(key) or '').split(';'))
 names=set()
 for value in values:
  if not value:continue
  name=normalized_name(value)
  # “Wilderness Area” is the same designation as “Wilderness”, not a
  # dropped distinguishing place-name token (e.g. Upper/Lower or National).
  if name[-2:]==('wilderness','area'):name=name[:-1]
  if name:names.add(name)
 return names


def global_area_ids(source):
 ids=set()
 for data in (source.get('tags',{}),source.get('properties',{})):
  for key,namespace in [('wikidata','wikidata'),('ref:wdpa','wdpa'),('WDPA_Cd','wdpa')]:
   value=data.get(key)
   if value is not None and str(value).strip() not in ('','0','0.0'):
    value=str(value).strip()
    if namespace=='wdpa':
     try:value=str(int(value))
     except ValueError:continue
    ids.add((namespace,value))
 return ids


def match_protected_area_repeats(manifest,features):
 """Share nearby display repetition, never union catalog identity or geometry."""
 sources={f['id']:f for f in features if f['kind']=='boundary'}
 records=[]
 for a in manifest.annotations:
  source=sources.get(a.get('sourceId') or manifest.features[a['featureId']].get('sourceId'))
  if source is None or a['kind']!='region-label' or a.get('layer')!='boundaries':continue
  geometry=shape(source['geometry'])
  if geometry.geom_type not in ('Polygon','MultiPolygon') or not geometry.is_valid or not geometry.area:continue
  records.append((a,source,geometry,protected_names(source),global_area_ids(source)))
 records.sort(key=lambda r:r[1]['id']);parent=list(range(len(records)));matches=[]
 def find(i):
  while parent[i]!=i:i=parent[i]
  return i
 for i,(a,source,g,names,ids) in enumerate(records):
  for j in range(i):
   b,other,h,other_names,other_ids=records[j]
   if source['provider']==other['provider']:continue
   explicit=sorted(ids&other_ids)
   if not explicit and not names.intersection(other_names):continue
   if explicit:evidence={'evidence':'shared-global-id','globalIds':[list(v) for v in explicit]}
   else:
    # Symmetric overlap excludes nearby similarly named units and a small
    # contained designation that happens to share a larger unit's name.
    if not g.intersects(h):continue
    intersection=g.intersection(h).area;overlap=intersection/(g.area+h.area-intersection)
    if overlap<.9:continue
    evidence={'evidence':'same-semantic-name-and-area-overlap','intersectionOverUnion':round(overlap,6)}
   parent[find(i)]=find(j)
   matches.append({'sourceIds':[other['id'],source['id']],**evidence})
 groups=defaultdict(list)
 for i,record in enumerate(records):groups[find(i)].append(record)
 for group in groups.values():
  if len(group)<2:continue
  source_ids=sorted(r[1]['id'] for r in group);repeat=stable_id('protected-area-display',source_ids)
  for a,source,_,_,_ in group:
   a['displayRepeatMatch']={'rule':'cross-provider-protected-area-v1','confidence':'inferred-display-equivalence','sourceIds':source_ids,'originalRepeatGroup':a['repeatGroup']}
   a['repeatGroup']=repeat
 return {'rule':'cross-provider-protected-area-v1','minimumIntersectionOverUnion':.9,'matched':matches}
