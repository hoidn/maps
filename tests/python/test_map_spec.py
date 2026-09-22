import unittest,sys,json,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from map_spec import MapSpec,MAPS
class MapSpecTests(unittest.TestCase):
 def test_all_configured_regions_round_trip_and_use_metric_working_coordinates(self):
  for name in MAPS.glob('*.json'):
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
 def test_contour_profile_rejects_invalid_intervals(self):
  for intervals in ([0,100,50],[50,100,250],[250,100],[250,100,30]):
   with self.assertRaisesRegex(ValueError,'contour'):
    MapSpec.from_dict({'id':'test','title':'Test','bbox':[0,0,1,1],'contourIntervalsFeet':intervals})
 def test_legacy_adapter_cannot_reinterpret_caches_under_a_changed_frame(self):
  from map_spec import validate_legacy_terrain_frame
  from dataclasses import replace
  s=MapSpec.load('grand_canyon');validate_legacy_terrain_frame(s)
  for changed in (replace(s,bbox=(-113,35,-112,36)),replace(s,width=1200),replace(s,contour_intervals=(200,100,50))):
   with self.assertRaisesRegex(ValueError,'legacy'):validate_legacy_terrain_frame(changed)
 def test_invalid_dimensions_and_buffer_fail_before_geographic_operations(self):
  for values in ({'width':float('nan')},{'width':True},{'height':3.5},{'bufferDegrees':-1},{'bufferDegrees':float('inf')},{'contourIntervalsFeet':None}):
   with self.subTest(values=values),self.assertRaises(ValueError):MapSpec.from_dict({'id':'test','title':'Test','bbox':[0,0,1,1],**values})

 def test_discovery_includes_third_region_and_safe_ids(self):
  self.assertEqual(MapSpec.configured_ids(),['grand_canyon','san_gabriel','sequoia'])
  for name in ('../bad','a/b','a\\b','.', 'UPPER', '', None):
   with self.subTest(name=name),self.assertRaisesRegex(ValueError,'map ID'):
    MapSpec.from_dict({'id':name,'title':'Unsafe','bbox':[0,0,1,1]})
 def test_san_gabriel_matches_central_geodetic_aspect(self):
  from pyproj import Geod
  s=MapSpec.load('san_gabriel');w,south,e,n=s.bbox;lat,lon=s.center;g=Geod(ellps='WGS84')
  self.assertEqual(s.bbox,(-118.45,34.10,-117.42,34.55))
  self.assertEqual(s.height,round(s.width*g.inv(lon,south,lon,n)[2]/g.inv(w,lat,e,lat)[2]))
 def test_explicit_custom_json_file_still_loads(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'different-name.json';p.write_text(json.dumps({'id':'custom','title':'Custom','bbox':[0,0,1,1]}))
   self.assertEqual(MapSpec.load(p).id,'custom')
