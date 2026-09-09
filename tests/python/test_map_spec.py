import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from map_spec import MapSpec
class MapSpecTests(unittest.TestCase):
 def test_both_regions_round_trip_and_use_metric_working_coordinates(self):
  for name in ['grand_canyon','sequoia']:
   s=MapSpec.load(name);lat,lon=s.center
   x,y=s.project(lat,lon);a,b=s.unproject(x,y)
   self.assertAlmostEqual(a,lat,9);self.assertAlmostEqual(b,lon,9)
   x,y=s.metric(lat,lon);a,b=s.geographic(x,y)
   self.assertAlmostEqual(a,lat,7);self.assertAlmostEqual(b,lon,7)
   self.assertGreater(s.meters_per_map_unit,1)
 def test_frame_validation_rejects_wrong_region(self):
  a=MapSpec.load('grand_canyon');b=MapSpec.load('sequoia')
  with self.assertRaisesRegex(ValueError,'frame'):a.validate_cache({'frame':b.frame})
  a.validate_cache({'frame':a.frame})
 def test_invalid_extents_fail(self):
  with self.assertRaises(ValueError):MapSpec.from_dict({'id':'bad','title':'bad','bbox':[10,40,9,41],'width':1300,'height':1070})
