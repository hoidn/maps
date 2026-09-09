import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from sources.osm import overpass_query
from map_spec import MapSpec
class QueryTests(unittest.TestCase):
 def test_queries_follow_area_and_classes_without_names(self):
  for name in ['grand_canyon','sequoia']:
   q=overpass_query(MapSpec.load(name));self.assertIn('highway',q);self.assertIn('waterway',q);self.assertIn('building',q);self.assertNotIn('Kaibab',q);self.assertNotIn('["name"]',q);self.assertIn('>>',q)
 def test_all_shop_types_are_requested_without_requiring_other_poi_tags(self):
  query=overpass_query(MapSpec.load('sequoia'))
  self.assertIn('nwr["shop"]',query)
 def test_standalone_fords_are_requested_without_requiring_named_paths(self):
  self.assertIn('nwr["ford"]',overpass_query(MapSpec.load('sequoia')))
