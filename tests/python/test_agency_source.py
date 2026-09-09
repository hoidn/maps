import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from sources.agency import esri_geometry
from shapely.geometry import shape
class AgencyTests(unittest.TestCase):
 def test_polygon_holes_and_disconnected_islands_survive(self):
  g=esri_geometry({'rings':[[[0,0],[0,10],[10,10],[10,0],[0,0]],[[2,2],[8,2],[8,8],[2,8],[2,2]],[[20,0],[20,2],[22,2],[22,0],[20,0]]]})
  self.assertEqual(shape(g).area,68);self.assertTrue(shape(g).is_valid)
 def test_paths_keep_separate_components_and_drop_optional_z(self):
  g=esri_geometry({'paths':[[[0,0,1],[1,1,2]],[[5,5,3],[6,6,4]]]});self.assertEqual(g['type'],'MultiLineString');self.assertEqual(g['coordinates'][0][0],[0,0])
 def test_gnis_single_multipoint_is_a_point_and_multiple_stay_multiple(self):
  self.assertEqual(esri_geometry({'points':[[1,2,9]]}),{'type':'Point','coordinates':[1,2]})
  self.assertEqual(esri_geometry({'points':[[1,2],[3,4]]})['type'],'MultiPoint')
 def test_island_inside_a_hole_survives_even_odd_nesting(self):
  rings=[[[0,0],[0,10],[10,10],[10,0],[0,0]],[[2,2],[8,2],[8,8],[2,8],[2,2]],[[3,3],[3,4],[4,4],[4,3],[3,3]]]
  self.assertEqual(shape(esri_geometry({'rings':rings})).area,65)
 def test_repair_preserves_both_lobes_and_reports_source_change(self):
  ring=[[0,0],[0,2],[2,2],[2,0],[0,0],[-2,0],[-2,-2],[0,-2],[0,0]]
  with self.assertRaisesRegex(ValueError,'Invalid source polygon'):esri_geometry({'rings':[ring]})
  repairs=[];g=esri_geometry({'rings':[ring]},repairs=repairs)
  self.assertEqual(shape(g).area,8);self.assertTrue(repairs);self.assertTrue(shape(g).is_valid)
 def test_arcgis_rejects_duplicate_object_ids_even_when_batch_count_matches(self):
  from unittest.mock import patch
  from sources.agency import query_layer
  from map_spec import MapSpec
  spec=MapSpec.from_dict({'id':'test','title':'Test','bbox':[0,0,1,1]})
  replies=[{'objectIdField':'OBJECTID'},{'objectIds':[1,2]},{'features':[{'attributes':{'OBJECTID':1}},{'attributes':{'OBJECTID':1}}]}]
  with patch('sources.agency.request_json',side_effect=replies):
   with self.assertRaisesRegex(ValueError,'identity'):query_layer('https://example.test/layer',spec)
 def test_arcgis_empty_id_response_is_an_empty_catalog(self):
  from unittest.mock import patch
  from sources.agency import query_layer
  from map_spec import MapSpec
  spec=MapSpec.from_dict({'id':'test','title':'Test','bbox':[0,0,1,1]})
  with patch('sources.agency.request_json',side_effect=[{'objectIdField':'OBJECTID'},{'objectIds':None}]):
   self.assertEqual(query_layer('https://example.test/layer',spec)['count'],0)
 def test_overlapping_valid_shells_require_explicit_assembly_repair(self):
  geometry={'rings':[[[0,0],[0,2],[2,2],[2,0],[0,0]],[[1,0],[1,2],[3,2],[3,0],[1,0]]]}
  with self.assertRaisesRegex(ValueError,'assembled polygon'):esri_geometry(geometry)
  repairs=[];result=esri_geometry(geometry,repairs=repairs)
  self.assertEqual(shape(result).area,6)
  self.assertEqual(repairs[0]['scope'],'assembled polygon')
  self.assertEqual(repairs[0]['beforeAreaDegrees2'],8)
  self.assertEqual(repairs[0]['afterAreaDegrees2'],6)
 def test_overlapping_holes_require_explicit_assembly_repair(self):
  geometry={'rings':[[[0,0],[0,5],[5,5],[5,0],[0,0]],[[1,1],[3,1],[3,3],[1,3],[1,1]],[[2,1],[4,1],[4,3],[2,3],[2,1]]]}
  with self.assertRaisesRegex(ValueError,'assembled polygon'):esri_geometry(geometry)
  repairs=[];result=esri_geometry(geometry,repairs=repairs)
  self.assertEqual(shape(result).area,19);self.assertEqual(repairs[0]['scope'],'assembled polygon')
