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
