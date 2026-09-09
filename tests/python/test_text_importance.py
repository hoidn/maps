import unittest,sys
from pathlib import Path
from copy import deepcopy
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from cartography.text_importance import text_importance,apply_text_importance
from label_manifest import Manifest

class TextImportanceTests(unittest.TestCase):
 def test_semantic_zoom_hierarchy_is_name_and_location_independent(self):
  cases=[({'kind':'point-label','priority':830,'priorityReason':'trailhead'},48),({'kind':'point-label','style':'l-peak'},12),({'kind':'line-label','style':'l-hydro','featureLengthMeters':6000},48),({'kind':'line-label','style':'l-hydro','featureLengthMeters':800},32),({'kind':'line-label','style':'l-trail','distanceSegmentId':'segment'},3)]
  for a,limit in cases:
   value=text_importance(a);self.assertEqual(value['textMaxMetersPerPixel'],limit)
   self.assertEqual(value,text_importance({**a,'text':'Any renamed feature','anchor':[893,-221]}))
 def test_required_names_remain_eligible_without_a_density_cap(self):
  for field,value in [('requiredProfiles',['static-default']),('requiredGroup','Any route')]:
   policy=text_importance({'kind':'point-label',field:value});self.assertIsNone(policy['textMaxMetersPerPixel']);self.assertEqual(policy['textImportance'],1000)
 def test_prominence_uses_only_explicit_numeric_source_evidence(self):
  a={'kind':'point-label','style':'l-peak'}
  unknown=text_importance(a,{'tags':{'ele':'4300','name':'Very Important Peak'}})
  self.assertEqual(unknown['textMaxMetersPerPixel'],12)
  self.assertEqual(text_importance(a,{'tags':{'prominence':'700'}})['textMaxMetersPerPixel'],96)
 def test_annotations_keep_identity_geometry_and_symbol_visibility(self):
  m=Manifest();m.symbol('<path/>','camp',[10,20],source_id='a');m.label('<text>Any Camp</text>','Any Camp','l-place',[10,20],source_id='a')
  symbol=deepcopy(m.annotations[0]);features=deepcopy(m.features);anchor=deepcopy(m.annotations[1]['anchor']);source=[{'id':'a','tags':{'tourism':'camp_site'}}];before=deepcopy(source)
  report=apply_text_importance(m,source)
  self.assertEqual(symbol,m.annotations[0]);self.assertEqual(features,m.features);self.assertEqual(anchor,m.annotations[1]['anchor']);self.assertEqual(source,before);self.assertEqual(report['scope'],'text-only')
