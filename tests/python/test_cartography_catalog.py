import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from cartography.names import merge_names
from cartography.hydro import combine_hydro,hydro_style
from cartography.poi import poi_style
from cartography.route_graph import junction_segments
from map_spec import MapSpec

def feature(i,coords,**kw):
 return dict(id=i,provider='osm',kind='trail',name=None,geometry={'type':'LineString','coordinates':coords},tags={},properties={},nodeIds=[],**kw)
class CatalogTests(unittest.TestCase):
 def test_hydro_unknown_is_not_perennial(self):
  self.assertIsNone(hydro_style({'tags':{},'properties':{}})['intermittent'])
  self.assertTrue(hydro_style({'tags':{'intermittent':'yes'},'properties':{}})['intermittent'])
 def test_names_require_identifier_not_proximity(self):
  a={'id':'a','kind':'waterway','name':None,'properties':{'gnisId':'42'}}
  b={'id':'b','kind':'waterway','name':None,'properties':{}}
  names=[{'id':'gnis:42','name':'Arbitrary Creek','properties':{'gnisId':'42'}}]
  out,report=merge_names([a,b],names)
  self.assertEqual(out[0]['name'],'Arbitrary Creek');self.assertIsNone(out[1]['name']);self.assertEqual(report['idMatches'],1)
 def test_hydro_coverage_dedup_keeps_nonoverlapping_extension(self):
  a=feature('osm:1',[[0,0],[.01,0]]);a['kind']='waterway'
  b=feature('3dhp:2',[[0,0],[.02,0]]);b.update(kind='waterway',provider='3dhp')
  spec=MapSpec.from_dict({'id':'test','title':'test','bbox':[-.1,-.1,.1,.1]})
  out,report=combine_hydro([a],[b],spec)
  self.assertEqual(len(out),2);self.assertGreater(report['clippedOverlap'],0)
  self.assertGreater(out[1]['geometry']['coordinates'][0][0],.009)
 def test_facility_type_and_unknown_water(self):
  self.assertEqual(poi_style({'amenity':'toilets'})['symbol'],'toilets')
  self.assertNotIn('potable',poi_style({'natural':'spring'})['description'].lower())
 def test_graph_splits_true_junction_no_nearness_join(self):
  a=feature('a',[[0,0],[.001,0],[.002,0]]);a['nodeIds']=[1,2,3]
  b=feature('b',[[.001,0],[.001,.001]]);b['nodeIds']=[2,4]
  c=feature('c',[[.001,.0000001],[.002,.0000001]]);c['nodeIds']=[5,6]
  edges=junction_segments([a,b,c])
  self.assertEqual(len(edges),4);self.assertAlmostEqual(edges[0]['meters'],111.31949,places=3)
  self.assertTrue(all(e['method']=='WGS84 geodesic; OSM node topology' for e in edges))
 def test_crossing_and_differently_named_hydro_stays_connected(self):
  a=feature('a',[[0,0],[.02,0]]);a.update(kind='waterway',name='One')
  b=feature('b',[[.01,-.01],[.01,.01]]);b.update(kind='waterway',provider='3dhp',name='Two')
  c=feature('c',[[0,.00005],[.02,.00005]]);c.update(kind='waterway',provider='3dhp',name='Three')
  spec=MapSpec.from_dict({'id':'test','title':'test','bbox':[-.1,-.1,.1,.1]})
  out,report=combine_hydro([a],[b,c],spec)
  self.assertEqual(len(out),3)
  from shapely.geometry import shape
  for actual,original in zip(out[1:],[b,c]):self.assertLess(shape(actual['geometry']).hausdorff_distance(shape(original['geometry'])),1e-9)
