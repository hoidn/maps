import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from cartography.transport import transport_style
class TransportStyleTests(unittest.TestCase):
 def test_names_and_region_never_change_style(self):
  tags={'highway':'track','tracktype':'grade3','surface':'gravel','motor_vehicle':'no'}
  a=transport_style(tags);self.assertEqual(a,transport_style({**tags,'name':'Different','region':'sequoia'}));self.assertEqual(a['surface'],'unpaved');self.assertEqual(a['motorAccess'],'no');self.assertEqual(a['trackGrade'],'grade3')
 def test_road_importance_is_separate_from_surface_and_access(self):
  paved=transport_style({'highway':'primary','surface':'asphalt'});gravel=transport_style({'highway':'primary','surface':'gravel'});minor=transport_style({'highway':'service','surface':'asphalt'})
  self.assertEqual(paved['importance'],gravel['importance']);self.assertGreater(paved['width'],minor['width']);self.assertNotEqual(paved['dash'],gravel['dash'])
 def test_unknown_difficulty_and_lifecycle_are_not_inferred_from_name(self):
  a=transport_style({'highway':'path','name':'Easy Trail'});self.assertIsNone(a['difficulty'])
  b=transport_style({'highway':'construction','construction':'path'});self.assertEqual(b['status'],'construction');self.assertEqual(b['kind'],'trail')
 def test_missing_lifecycle_stays_unknown_without_changing_default_paint(self):
  style=transport_style({'highway':'path'})
  self.assertEqual(style['status'],'unknown');self.assertEqual(style['color'],'trail');self.assertEqual(style['dash'],[4,2])
  road=transport_style({'highway':'primary','surface':'asphalt'})
  self.assertEqual(road['status'],'unknown');self.assertEqual(road['color'],'road');self.assertEqual(road['dash'],[])
