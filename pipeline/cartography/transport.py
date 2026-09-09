"""Independent network, physical condition, access and lifecycle dimensions."""
ROAD_RANK={'motorway':7,'motorway_link':6,'trunk':6,'trunk_link':5,'primary':5,'primary_link':4,'secondary':4,'secondary_link':3,'tertiary':3,'tertiary_link':2,'unclassified':2,'residential':2,'living_street':1,'service':1,'track':0}
PAVED={'asphalt','paved','concrete','concrete:plates','paving_stones','sett'}
UNPAVED={'unpaved','gravel','fine_gravel','compacted','ground','dirt','earth','sand','rock','mud','grass','woodchips'}
TRAILS={'path','footway','steps','bridleway','cycleway','pedestrian'}
def visible_reference(kind,name,reference):
 """A named walking route is identified by its full name, not an opaque code.

 Road refs remain useful signage, and an unnamed path may have only a mapped
 reference. All references still belong in source records and trail details.
 """
 return reference if reference and (kind=='road' or not name or not name.strip()) else None

def transport_style(tags):
 highway=tags.get('highway','path');status='construction' if highway=='construction' else 'abandoned' if tags.get('abandoned')=='yes' else 'disused' if tags.get('disused')=='yes' else 'unknown'
 if highway=='construction':highway=tags.get('construction','path')
 kind='trail' if highway in TRAILS else 'road';rank=ROAD_RANK.get(highway,0)
 surface='paved' if tags.get('surface') in PAVED else 'unpaved' if tags.get('surface') in UNPAVED else 'unknown'
 access=tags.get('foot',tags.get('access')) if kind=='trail' else tags.get('motor_vehicle',tags.get('vehicle',tags.get('access')))
 restricted=access in ('no','private')
 difficulty=tags.get('sac_scale');visibility=tags.get('trail_visibility')
 if kind=='road':
  width=1+rank*.32;dash=[] if surface=='paved' else [5,2] if surface=='unpaved' else [8,2]
  if highway=='track':width=1;dash=[4,3]
  detail=64 if rank>=4 else 32 if rank>=2 else 12
 else:
  width=1.5 if highway in ('footway','pedestrian','cycleway') else 1.3
  dash=[1,2] if highway=='steps' else [4,2]
  if difficulty in ('demanding_mountain_hiking','alpine_hiking','demanding_alpine_hiking','difficult_alpine_hiking') or visibility in ('bad','horrible','no'):dash=[2,3]
  detail=32 if highway in ('path','bridleway') else 12
 if restricted or status not in ('unknown','active'):dash=[2,4]
 return {'kind':kind,'class':highway,'importance':rank,'width':width,'caseWidth':width+1.2 if kind=='road' else 0,'dash':dash,'color':'restricted' if restricted or status not in ('unknown','active') else 'road' if kind=='road' else 'trail','surface':surface,'difficulty':difficulty,'visibility':visibility,'trackGrade':tags.get('tracktype'),'smoothness':tags.get('smoothness'),'access':access,'motorAccess':tags.get('motor_vehicle',tags.get('vehicle',tags.get('access'))),'status':status,'maxMetersPerPixel':detail}
