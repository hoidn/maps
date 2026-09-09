"""Display aliases must not become geographic merges or hide nearby services."""
import sys, unittest
from copy import deepcopy
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'pipeline'))
from label_manifest import Manifest
from map_spec import MapSpec
from cartography.scene import render_scene
from cartography.entities import normalized_name


class DisplayEntityTests(unittest.TestCase):
 def fixture(self, name='Juniper CG', source_name='Juniper Campground', role='camp', tags=None, offset=0, mode='interactive', distance=.00002):
  spec=MapSpec.from_dict({'id':'arbitrary','title':'Arbitrary','bbox':[offset,offset,offset+.1,offset+.1]})
  xy=spec.project(offset+.05,offset+.05);m=Manifest(mode=mode)
  m.symbol('<g/>',role,xy)
  m.label('<text transform="translate(800,700)">Unrelated visual offset</text>',name,'l-place',xy)
  original=deepcopy(m.annotations);features=deepcopy(m.features)
  f={'id':'osm:node:1','provider':'osm','kind':'poi','name':source_name,'tags':tags or {'tourism':'camp_site'},'geometry':{'type':'Point','coordinates':[offset+.05+distance,offset+.05]}}
  return spec,m,f,original,features

 def test_aliases_share_source_repeat_group_across_names_translation_and_modes(self):
  for mode in ['interactive','static']:
   for name,source_name,role,tags in [('Juniper CG','Juniper Campground','camp',{'tourism':'camp_site'}),('Renamed Camp','Renamed Campground','camp',{'tourism':'camp_site'}),('Sierra TH','Sierra Trailhead','th',{'highway':'trailhead'})]:
    for offset in [0,36]:
     with self.subTest(mode=mode,name=name,offset=offset):
      spec,m,f,original,features=self.fixture(name,source_name,role,tags,offset,mode)
      before=deepcopy(f);_,report=render_scene([f],[],spec,m)
      a=next(a for a in m.annotations if a['id']==original[1]['id']);source=next(a for a in m.annotations if a.get('sourceId')==f['id'] and a['kind']=='point-label')
      self.assertEqual(a['repeatGroup'],source['repeatGroup'])
      self.assertEqual(a['repeatDistance'],180);self.assertEqual(a['priority'],source['priority'])
      self.assertEqual(a['text'],name);self.assertEqual(a['anchor'],original[1]['anchor']);self.assertEqual(a['featureId'],original[1]['featureId'])
      self.assertEqual(m.features[a['featureId']],features[a['featureId']]);self.assertEqual(f,before)
      self.assertEqual(m.annotations[0],original[0])
      self.assertEqual(a['displayRepeatMatch']['sourceId'],f['id']);self.assertLessEqual(a['displayRepeatMatch']['distanceMeters'],10)
      self.assertEqual(report['displayRepeatMatches']['matched'][0]['annotationId'],a['id'])

 def test_secondary_water_symbol_does_not_erase_explicit_camp_role(self):
  spec,m,f,original,_=self.fixture();m.symbol('<g/>','water',m.features[original[1]['featureId']]['anchor'],offset=(-12,0))
  water=deepcopy(m.annotations[-1]);_,report=render_scene([f],[],spec,m)
  self.assertEqual(m.annotations[1]['repeatGroup'],next(a['repeatGroup'] for a in m.annotations if a.get('sourceId')==f['id'] and a['kind']=='point-label'))
  self.assertEqual(next(a for a in m.annotations if a['id']==water['id']),water)

 def test_required_priority_and_source_node_area_group_are_preserved(self):
  spec,m,f,original,_=self.fixture();m.annotations[1]['requiredProfiles']=['static-default']
  area=deepcopy(f);area.update(id='osm:way:2',geometry={'type':'Polygon','coordinates':[[[.0502,.05],[.0505,.05],[.0505,.0505],[.0502,.0505],[.0502,.05]]]})
  _,report=render_scene([f,area],[],spec,m)
  labels=[a for a in m.annotations if a['kind']=='point-label']
  self.assertEqual(len({a['repeatGroup'] for a in labels}),1)
  self.assertEqual(labels[0]['priority'],1000);self.assertEqual(len(report['displayRepeatMatches']['matched']),1)
  self.assertEqual(len(m.features),3)

 def test_rejects_distant_and_ambiguous_matches(self):
  spec,m,f,original,_=self.fixture(distance=.0002);_,report=render_scene([f],[],spec,m)
  self.assertEqual(m.annotations[1]['repeatGroup'],original[1]['repeatGroup']);self.assertEqual(report['displayRepeatMatches']['matched'],[])
  spec,m,f,original,_=self.fixture();other=deepcopy(f);other['id']='osm:node:2';other['geometry']['coordinates'][0]-=.00004
  _,report=render_scene([f,other],[],spec,m)
  self.assertEqual(m.annotations[1]['repeatGroup'],original[1]['repeatGroup']);self.assertEqual(report['displayRepeatMatches']['matched'],[])
  self.assertEqual(report['displayRepeatMatches']['ambiguous'][0]['sourceIds'],['osm:node:1','osm:node:2'])

 def test_roles_and_full_name_tokens_preserve_separate_destinations(self):
  cases=[('Lodgepole CG','Lodgepole Campground','camp',{'highway':'bus_stop','public_transport':'platform'}),('General Sherman Tree','The General Sherman Tree','view',{'tourism':'information','information':'board'}),('General Sherman Tree','Sherman Tree Trailhead','view',{'highway':'trailhead'}),('Upper Ribbon Falls','Upper Upper Ribbon Falls','falls',{'waterway':'waterfall'}),('Clear Creek CG','Clear Creek','camp',{'waterway':'stream'})]
  for name,source_name,role,tags in cases:
   with self.subTest(name=name,source_name=source_name):
    spec,m,f,original,_=self.fixture(name,source_name,role,tags);_,report=render_scene([f],[],spec,m)
    self.assertEqual(m.annotations[1]['repeatGroup'],original[1]['repeatGroup']);self.assertEqual(report['displayRepeatMatches']['matched'],[])

 def test_unique_containing_area_matches_authored_alias_without_moving_either_feature(self):
  for offset in [0,36]:
   spec,m,f,original,features=self.fixture(offset=offset)
   ring=[[offset+x,offset+y] for x,y in [(.048,.048),(.052,.048),(.052,.052),(.048,.052),(.048,.048)]]
   f.update(id='osm:relation:area',geometry={'type':'MultiPolygon','coordinates':[[ring]]})
   before=deepcopy(f);_,report=render_scene([f],[],spec,m)
   a=m.annotations[1];source=next(a for a in m.annotations if a.get('sourceId')==f['id'] and a['kind']=='point-label')
   self.assertEqual(a['repeatGroup'],source['repeatGroup'])
   self.assertEqual(a['anchor'],original[1]['anchor']);self.assertEqual(m.features[a['featureId']],features[a['featureId']]);self.assertEqual(f,before)
   self.assertEqual(report['displayRepeatMatches']['matched'][0]['spatialEvidence'],'anchor-covered-by-source-area')

 def test_area_holes_and_overlapping_same_named_areas_do_not_authorize_aliases(self):
  ring=[[.048,.048],[.052,.048],[.052,.052],[.048,.052],[.048,.048]]
  hole=[[.049,.049],[.051,.049],[.051,.051],[.049,.051],[.049,.049]]
  spec,m,f,original,_=self.fixture();f.update(id='osm:way:area',geometry={'type':'Polygon','coordinates':[ring,hole]})
  _,report=render_scene([f],[],spec,m)
  self.assertEqual(m.annotations[1]['repeatGroup'],original[1]['repeatGroup']);self.assertEqual(report['displayRepeatMatches']['matched'],[])
  spec,m,f,original,_=self.fixture();f.update(id='osm:way:area',geometry={'type':'Polygon','coordinates':[ring]})
  other=deepcopy(f);other['id']='osm:way:another-area';_,report=render_scene([f,other],[],spec,m)
  self.assertEqual(m.annotations[1]['repeatGroup'],original[1]['repeatGroup']);self.assertEqual(len(report['displayRepeatMatches']['ambiguous']),1)

 def test_numeric_shelter_and_viewpoint_aliases_keep_full_names_and_source_identity(self):
  for role,name,other,tags in [('shelter','1½ Mile Resthouse','1.5 Mile Resthouse',{'amenity':'shelter'}),('view','Renamed Overlook','Renamed Overlook',{'tourism':'viewpoint'})]:
   spec,m,f,original,features=self.fixture(name,other,role,tags)
   if role=='shelter':f.update(kind='building',roles=['building','poi'],geometry={'type':'Polygon','coordinates':[[[.049,.049],[.051,.049],[.051,.051],[.049,.051],[.049,.049]]]})
   before=deepcopy(f);_,report=render_scene([f],[],spec,m)
   a=m.annotations[1];b=next(a for a in m.annotations if a.get('sourceId')==f['id'] and a['kind']=='point-label')
   self.assertEqual(a['repeatGroup'],b['repeatGroup']);self.assertEqual(a['text'],name);self.assertEqual(a['anchor'],original[1]['anchor']);self.assertEqual(f,before)
   self.assertEqual(len(report['displayRepeatMatches']['matched']),1)

 def test_transit_names_remain_searchable_without_competing_with_nearby_viewpoints(self):
  spec,m,f,original,_=self.fixture('Renamed Overlook','Renamed Overlook','view',{'tourism':'viewpoint'})
  bus=deepcopy(f);bus.update(id='osm:node:bus',tags={'highway':'bus_stop','public_transport':'platform'});bus['geometry']['coordinates'][0]+=.0007
  _,report=render_scene([f,bus],[],spec,m)
  self.assertEqual(len(report['displayRepeatMatches']['matched']),1)
  self.assertFalse(any(a.get('sourceId')==bus['id'] and a['kind']=='point-label' for a in m.annotations))
  self.assertTrue(any(a.get('sourceId')==bus['id'] and a['symbolKind']=='bus' for a in m.annotations if a['kind']=='symbol'))
  self.assertTrue(any(f.get('sourceId')==bus['id'] and f['directory'] and f['name']=='Renamed Overlook' for f in m.features.values()))

 def test_numeric_spelling_preserves_invalid_literals_and_all_distinguishing_words(self):
  self.assertEqual(normalized_name('1½ Mile Resthouse','shelter'),normalized_name('1.5 Mile Rest House','shelter'))
  self.assertNotEqual(normalized_name('Upper 1½ Mile Resthouse','shelter'),normalized_name('1.5 Mile Resthouse','shelter'))
  self.assertIn('1/0',normalized_name('Trail 1/0 Shelter','shelter'))

 def test_numeric_nearby_and_role_ambiguity_do_not_authorize_a_merge(self):
  for name,other,role,tags,distance in [('1½ Mile Resthouse','2.5 Mile Resthouse','shelter',{'amenity':'shelter'},.00002),('Vista Overlook','Vista Overlook','view',{'tourism':'viewpoint'},.0008),('Vista Overlook','Vista Overlook','view',{'highway':'bus_stop'},.00002)]:
   spec,m,f,original,_=self.fixture(name,other,role,tags,distance=distance);_,report=render_scene([f],[],spec,m)
   self.assertEqual(report['displayRepeatMatches']['matched'],[]);self.assertEqual(m.annotations[1]['repeatGroup'],original[1]['repeatGroup'])

 def test_numeric_display_repeat_is_not_a_geographic_alias(self):
  for left,right in [('1½ Mile Resthouse','1.5 Mile Resthouse'),('Cabin 2¼','Cabin 2.25'),('Pool ¾','Pool 0.75')]:
   m=Manifest()
   for i,name in enumerate([left,right,'Upper '+right,right+'!',right.replace('2.25','2.5')+' Annex']):
    m.label('<text>'+name+'</text>',name,'l-place',(100+i*30,200),source_id='source:'+str(i))
   a,b,*others=m.annotations
   self.assertEqual(a['repeatGroup'],b['repeatGroup'])
   self.assertTrue(all(a['repeatGroup']!=o['repeatGroup'] for o in others))
   self.assertNotEqual(a['featureId'],b['featureId']);self.assertNotEqual(a['anchor'],b['anchor'])
   self.assertEqual([a['text'],b['text']],[left,right]);self.assertNotIn('displayRepeatMatch',a)
  m=Manifest()
  for i,name in enumerate(['Trail 1½','Trail 1.5']):m.label('<text>'+name+'</text>',name,'l-trail',(i,0),kind='line-label')
  self.assertNotEqual(m.annotations[0]['repeatGroup'],m.annotations[1]['repeatGroup'])

 def boundary_fixture(self,other_name='Juniper Wilderness Area',shift=.0001,other_tags=None):
  spec=MapSpec.from_dict({'id':'arbitrary','title':'Arbitrary','bbox':[0,0,.1,.1]});m=Manifest()
  a={'id':'osm:relation:forest','provider':'osm','kind':'boundary','name':'Juniper Wilderness','tags':{'boundary':'protected_area','wikidata':'Q100'},'geometry':{'type':'Polygon','coordinates':[[[.01,.01],[.09,.01],[.09,.09],[.01,.09],[.01,.01]]]}}
  b=deepcopy(a);b.update(id='agency:2',provider='agency',name=other_name,tags=other_tags or {})
  b['geometry']['coordinates']=[[[x+shift,y] for x,y in ring] for ring in a['geometry']['coordinates']]
  return spec,m,a,b

 def test_protected_area_equivalence_requires_full_semantic_name_and_matching_geometry(self):
  spec,m,a,b=self.boundary_fixture();before=deepcopy([a,b]);_,report=render_scene([a,b],[],spec,m)
  labels=[a for a in m.annotations if a['kind']=='region-label'];self.assertEqual(len(labels),2)
  self.assertEqual(len({a['repeatGroup'] for a in labels}),1);self.assertEqual([a,b],before)
  self.assertEqual({a['text'] for a in labels},{'Juniper Wilderness','Juniper Wilderness Area'})
  self.assertEqual(len(report['displayRepeatMatches']['protectedAreas']['matched']),1)
  for name,shift in [('Upper Juniper Wilderness',.0001),('Juniper Wilderness Area',.04)]:
   spec,m,a,b=self.boundary_fixture(name,shift);_,report=render_scene([a,b],[],spec,m)
   self.assertEqual(report['displayRepeatMatches']['protectedAreas']['matched'],[])

 def test_protected_area_explicit_identity_preserves_distinct_catalogs(self):
  spec,m,a,b=self.boundary_fixture('Juniper Preserve',.001,{'wikidata':'Q100'});_,report=render_scene([a,b],[],spec,m)
  self.assertEqual(len(m.features),2);self.assertEqual(len({a['repeatGroup'] for a in m.annotations}),1)
  self.assertEqual(report['displayRepeatMatches']['protectedAreas']['matched'][0]['evidence'],'shared-global-id')

if __name__=='__main__':unittest.main()
