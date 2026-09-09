import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from map_spec import MapSpec
from label_manifest import Manifest
from cartography.scene import render_scene
from cartography.text_importance import apply_text_importance
class FontHierarchyTests(unittest.TestCase):
 def test_settlement_source_categories_use_one_portable_typographic_role(self):
  spec=MapSpec.from_dict({'id':'test','title':'Test','bbox':[0,0,.1,.1]})
  for tags,properties in [({'place':value},{}) for value in ('city','town','village','hamlet')]+[({}, {'featureClass':'Populated Place'})]:
   for name in ('Grand Canyon Village','Renamed Settlement'):
    with self.subTest(tags=tags,name=name):
     feature={'id':'osm:node:150952317','kind':'poi','name':name,'tags':tags,'properties':properties,'geometry':{'type':'Point','coordinates':[.05,.05]}}
     m=Manifest();render_scene([feature],[],spec,m)
     a=next(a for a in m.annotations if a['kind']=='point-label');self.assertEqual(a['style'],'l-settlement');self.assertEqual(a['text'],name);self.assertEqual(a['priorityReason'],'settlement');self.assertEqual(a['sourceId'],feature['id'])
 def test_local_and_major_road_roles_follow_network_class_not_name(self):
  spec=MapSpec.from_dict({'id':'test','title':'Test','bbox':[0,0,.1,.1]})
  for highway,expected in [('residential','l-road'),('service','l-road'),('tertiary','l-road'),('secondary','l-road-major'),('primary','l-road-major'),('trunk','l-road-major')]:
   f={'id':'road','kind':'road','name':'Boulder Alley','tags':{'highway':highway},'geometry':{'type':'LineString','coordinates':[[.01,.05],[.09,.05]]}}
   m=Manifest();render_scene([f],[],spec,m)
   self.assertTrue(m.annotations);self.assertEqual({a['style'] for a in m.annotations},{expected});self.assertTrue(all(a['text']==f['name'] for a in m.annotations))
   apply_text_importance(m,[f]);self.assertTrue(all(a['textImportanceReason']==('major-road' if expected=='l-road-major' else 'local-road') for a in m.annotations))
