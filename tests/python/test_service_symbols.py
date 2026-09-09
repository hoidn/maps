import ast, sys, unittest, xml.etree.ElementTree as ET
from copy import deepcopy
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from cartography.symbols import symbol_svg
from cartography.scene import render_scene
from cartography.integration import transport_legend
from label_manifest import Manifest
from map_spec import MapSpec

class ServiceSymbolTests(unittest.TestCase):
 def setUp(self):self.spec=MapSpec.from_dict({'id':'arbitrary','title':'Arbitrary','bbox':[0,0,.1,.1]})
 def test_camp_source_and_both_authored_builders_share_exact_glyph(self):
  for filename,func in [('build_interactive.py','_sym'),('build_static.py','_symbol_svg')]:
   tree=ast.parse((Path(__file__).resolve().parents[2]/'pipeline'/filename).read_text());definition=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==func)
   import cartography.symbols as symbols
   namespace={**vars(symbols),'P':lambda lat,lon:(0.,0.)};exec(compile(ast.Module(body=[definition],type_ignores=[]),filename,'exec'),namespace)
   authored=namespace[func]('camp') if func=='_sym' else namespace[func]('camp',0,0)
   self.assertEqual(symbol_svg('camp'),authored)
  paths=ET.fromstring('<g>'+symbol_svg('camp')+'</g>');self.assertEqual([p.get('class') for p in paths],['s-camp','s-camp-base'])
 def test_active_camp_and_toilet_symbols_are_explained_in_shared_legend(self):
  context={'spec':self.spec,'report':{'styles':[],'selected':{},'facilitySymbols':{'camp':2,'toilets':3}}}
  legend=transport_legend(context);self.assertIn('Campground / campsite',legend);self.assertIn('Toilets',legend);self.assertIn(symbol_svg('camp'),legend);self.assertIn(symbol_svg('toilets'),legend)
 def test_named_simple_services_keep_searchable_identity_but_no_map_label(self):
  for mode in ['static','interactive']:
   for amenity in ['toilets','bench','waste_basket','telephone']:
    for geometry,kind in [({'type':'Point','coordinates':[.04,.05]},'poi'),({'type':'Polygon','coordinates':[[[.03,.04],[.05,.04],[.05,.06],[.03,.06],[.03,.04]]]},'building')]:
     with self.subTest(mode=mode,amenity=amenity,kind=kind):
      f={'id':'osm:way:42','kind':kind,'provider':'osm','name':'Arbitrary named service','geometry':geometry,'tags':{'amenity':amenity,**({'building':'yes'} if kind=='building' else {})}};before=deepcopy(f);m=Manifest(mode=mode);groups,report=render_scene([f],[],self.spec,m)
      self.assertEqual([a['kind'] for a in m.annotations],['symbol']);self.assertTrue(groups['symbols']);self.assertEqual(f,before)
      feature=next(iter(m.features.values()));self.assertEqual(feature['name'],f['name']);self.assertEqual(feature['sourceId'],f['id']);self.assertTrue(feature['directory']);self.assertEqual(feature['mapLabelPolicy'],'symbol-only-service')
      self.assertEqual(report['omitted'][0]['reason'],'symbol-only-service-label')
      if kind=='building':self.assertIn('area-building',groups['buildings'])
 def test_camp_with_toilet_availability_keeps_destination_name(self):
  for tags in [{'tourism':'camp_site','toilets':'yes'},{'tourism':'camp_site','amenity':'toilets'}]:
   f={'id':'osm:node:1','kind':'poi','name':'Arbitrary Camp','geometry':{'type':'Point','coordinates':[.04,.05]},'tags':tags};m=Manifest();_,report=render_scene([f],[],self.spec,m)
   self.assertEqual([a['text'] for a in m.annotations if a['kind']=='point-label'],[f['name']]);self.assertEqual(m.annotations[0]['symbolKind'],'camp');self.assertEqual(report['omitted'],[])

if __name__=='__main__':unittest.main()
