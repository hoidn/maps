"""Display aliases must not become geographic merges or hide nearby services."""
import sys, unittest
from copy import deepcopy
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'pipeline'))
from label_manifest import Manifest
from map_spec import MapSpec
from cartography.scene import render_scene


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

if __name__=='__main__':unittest.main()
