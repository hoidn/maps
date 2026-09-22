import unittest,sys
from pathlib import Path
from copy import deepcopy
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from cartography.text_importance import text_importance,apply_text_importance
from label_manifest import Manifest

class TextImportanceTests(unittest.TestCase):
 def test_print_place_names_keep_feature_limits_and_priorities_without_extra_text_gate(self):
  for profile in (None,{'version':1,'mapWidthMm':1300*25.4/96}):
   m=Manifest('static');m.print_profile=profile;wrappers=[]
   for name,style,kind in [('Unknown Summit','l-peak','point-label'),('Camp','l-place','point-label'),('Contour','l-contour','point-label'),('Distance','l-place','point-label'),('Trail','l-trail','line-label')]:
    wrappers.append(m.label('<text>'+name+'</text>',name,style,[10,len(m.annotations)*20],kind=kind,source_id=name))
    m.annotations[-1]['maxMetersPerPixel']=32
    if name=='Distance':m.annotations[-1]['distanceSegmentId']='segment'
   expected=[text_importance(a) for a in m.annotations];before=deepcopy(m.annotations)
   apply_text_importance(m,[])
   for index,a in enumerate(m.annotations):
    self.assertEqual(a['textMaxMetersPerPixel'],None if profile and index<2 else expected[index]['textMaxMetersPerPixel'])
    self.assertEqual(a['priority'],expected[index]['textImportance'])
    self.assertEqual(a['textImportanceReason'],expected[index]['textImportanceReason'])
    for key in ('id','featureId','anchor','maxMetersPerPixel'):self.assertEqual(a[key],before[index][key])
   if profile:
    for mpp in (20,40):
     prepared=deepcopy(m);prepared.map_metadata={'metersPerMapUnit':mpp}
     prepared.finalize('<svg xmlns="http://www.w3.org/2000/svg">'+''.join(wrappers)+'</svg>')
     self.assertEqual(any(a['text']=='Unknown Summit' for a in prepared.annotations),mpp<32)
     self.assertEqual(prepared.features,m.features)

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
