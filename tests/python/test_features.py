import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from features import catalog_from_osm
from map_spec import MapSpec
class FeatureTests(unittest.TestCase):
 def test_attributes_connectivity_and_route_identity_survive(self):
  spec=MapSpec.load('grand_canyon');els=[{'type':'node','id':i,'lat':36.10,'lon':-112.1+i*.001} for i in range(1,5)]
  els += [{'type':'way','id':10,'nodes':[1,2],'tags':{'highway':'path','name':'Same','surface':'dirt','sac_scale':'mountain_hiking'}},{'type':'way','id':11,'nodes':[3,4],'tags':{'highway':'path','name':'Same','surface':'rock','access':'private'}},{'type':'relation','id':20,'members':[{'type':'way','ref':10,'role':''}],'tags':{'type':'route','route':'hiking','ref':'A','name':'Route'}}]
  c=catalog_from_osm(els,spec);fs={f['id']:f for f in c['features']}
  self.assertEqual(len(fs),2);self.assertEqual(fs['osm:way:10']['properties']['surface'],'dirt');self.assertEqual(fs['osm:way:11']['properties']['access'],'private')
  self.assertEqual(fs['osm:way:10']['routeIds'],['osm:relation:20']);self.assertEqual(fs['osm:way:11']['routeIds'],[])
  self.assertNotEqual(fs['osm:way:10']['nodeIds'][-1],fs['osm:way:11']['nodeIds'][0])
 def test_unnamed_geometry_is_kept_without_placeholder_name(self):
  s=MapSpec.load();c=catalog_from_osm([{'type':'node','id':1,'lat':36.1,'lon':-112.1},{'type':'node','id':2,'lat':36.11,'lon':-112.1},{'type':'way','id':3,'nodes':[1,2],'tags':{'waterway':'stream','intermittent':'yes'}}],s)
  f=c['features'][0];self.assertIsNone(f['name']);self.assertEqual(f['properties']['intermittent'],'yes')
 def test_incomplete_member_geometry_is_reported(self):
  with self.assertRaisesRegex(ValueError,'Missing OSM node'):catalog_from_osm([{'type':'way','id':3,'nodes':[1,2],'tags':{'highway':'path'}}],MapSpec.load())

class FacilityNodeTests(unittest.TestCase):
 def test_transport_and_waterfall_nodes_are_facilities(self):
  from features import feature_kind
  for tags in ({'highway':'trailhead'},{'highway':'bus_stop'},{'waterway':'waterfall'}):self.assertEqual(feature_kind(tags),'poi')
 def test_nested_osm_island_survives(self):
  from features import assemble_area
  from shapely.geometry import Polygon
  outer=[Polygon([(0,0),(.08,0),(.08,.08),(0,.08)]),Polygon([(.03,.03),(.04,.03),(.04,.04),(.03,.04)])]
  inner=[Polygon([(.02,.02),(.06,.02),(.06,.06),(.02,.06)])]
  g=assemble_area(outer,inner);self.assertAlmostEqual(g.area,.0049);self.assertTrue(g.is_valid)
 def test_building_facility_keeps_one_source_feature_with_two_semantic_roles(self):
  spec=MapSpec.from_dict({'id':'test','title':'Test','bbox':[0,0,.1,.1]})
  nodes=[{'type':'node','id':i,'lon':x,'lat':y} for i,(x,y) in enumerate([(.01,.01),(.02,.01),(.02,.02),(.01,.02)],1)]
  tags={'building':'yes','tourism':'information','information':'visitor_centre','name':'Arbitrary Visitor Centre'}
  data=catalog_from_osm(nodes+[{'type':'way','id':10,'nodes':[1,2,3,4,1],'tags':tags}],spec)
  self.assertEqual(len(data['features']),1);f=data['features'][0]
  self.assertEqual(f['kind'],'building');self.assertEqual(f['roles'],['building','poi']);self.assertEqual(f['id'],f['sourceId']);self.assertEqual(f['geometry']['type'],'Polygon');self.assertEqual(f['tags'],tags)
 def test_plain_buildings_do_not_become_invented_visitor_facilities(self):
  from features import feature_roles
  self.assertEqual(feature_roles({'building':'yes'}),['building'])
  self.assertEqual(feature_roles({'building':'yes','amenity':'toilets'}),['building','poi'])
  self.assertEqual(feature_roles({'building':'yes','shop':'convenience'}),['building','poi'])
 def test_standalone_shop_node_is_classified_without_a_second_poi_tag(self):
  from features import feature_kind
  self.assertEqual(feature_kind({'shop':'convenience'}),'poi')
  spec=MapSpec.from_dict({'id':'test','title':'Test','bbox':[0,0,.1,.1]})
  data=catalog_from_osm([{'type':'node','id':4,'lon':.02,'lat':.03,'tags':{'shop':'convenience','name':'Supplies'}}],spec)
  self.assertEqual(len(data['features']),1);self.assertEqual(data['features'][0]['roles'],['poi']);self.assertEqual(data['features'][0]['tags']['shop'],'convenience')
 def test_available_ford_crossing_and_linear_barrier_keep_source_identity(self):
  spec=MapSpec.from_dict({'id':'test','title':'Test','bbox':[0,0,.1,.1]})
  elements=[{'type':'node','id':1,'lat':.01,'lon':.01,'tags':{'ford':'yes'}},{'type':'node','id':2,'lat':.02,'lon':.02,'tags':{'highway':'crossing','crossing':'unmarked'}},{'type':'way','id':3,'nodes':[1,2],'tags':{'barrier':'fence'}}]
  data=catalog_from_osm(elements,spec);by={f['id']:f for f in data['features']}
  self.assertEqual(set(by),{'osm:node:1','osm:node:2','osm:way:3'})
  self.assertEqual(by['osm:way:3']['kind'],'barrier');self.assertEqual(by['osm:way:3']['geometry']['type'],'LineString')
  for key in ('osm:node:1','osm:node:2'):self.assertEqual(by[key]['kind'],'poi');self.assertEqual(by[key]['sourceId'],key)

 def test_ford_tag_does_not_replace_physical_trail_way(self):
  from features import feature_kind
  self.assertEqual(feature_kind({'highway':'path','ford':'yes'}),'trail')
  self.assertEqual(feature_kind({'leisure':'picnic_table'}),'poi')
