import sys,unittest,xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from cartography.integration import transport_legend
from cartography.transport import transport_style
from cartography.scene import render_scene
from map_spec import MapSpec
from label_manifest import Manifest

class TransportLegendTests(unittest.TestCase):
 def setUp(self):self.spec=MapSpec.from_dict({'id':'anywhere','title':'Anywhere','bbox':[0,0,.1,.1]})
 def legend(self,tags):
  html=transport_legend({'spec':self.spec,'report':{'styles':[transport_style(t) for t in tags]}})
  return ET.fromstring('<div>'+html+'</div>')
 def test_same_stroke_family_has_one_entry_even_when_source_classes_or_surface_differ(self):
  tags=[{'highway':h,'surface':s} for h in ['primary','primary_link','secondary','residential','service'] for s in ['paved']]
  tags += [{'highway':h,'surface':s} for h in ['cycleway','footway','path','bridleway'] for s in ['paved','ground','unknown']]
  root=self.legend(tags);items=root.findall('.//svg')
  self.assertEqual(len(items),2)
  self.assertEqual({x.get('data-transport-key') for x in items},{'road:road:solid','trail:trail:4,2'})
  self.assertIn('Road width follows network class',''.join(root.itertext()))
  self.assertNotIn('cycleway · paved',''.join(root.itertext()))
 def test_distinct_paint_patterns_survive_and_restricted_surface_does_not_multiply_swatches(self):
  tags=[{'highway':'residential','surface':s} for s in ['paved','ground','unknown']]
  tags += [{'highway':'service','access':'private','surface':s} for s in ['paved','ground','unknown']]
  tags += [{'highway':'steps'},{'highway':'path','sac_scale':'alpine_hiking'},{'highway':'track'}]
  items=self.legend(tags).findall('.//svg')
  self.assertEqual(len(items),7)
  self.assertEqual(len({x.get('data-transport-key') for x in items}),len(items))
  self.assertEqual(len([x for x in items if ':restricted:' in x.get('data-transport-key')]),1)
 def test_scene_inventory_keeps_different_difficulty_strokes_of_the_same_path_class(self):
  features=[{'id':str(i),'kind':'trail','name':'Path','tags':tags,'geometry':{'type':'LineString','coordinates':[[.01,.01],[.08,.08]]}} for i,tags in enumerate([{'highway':'path'},{'highway':'path','sac_scale':'alpine_hiking'}])]
  _,report=render_scene(features,[],self.spec,Manifest())
  self.assertEqual({tuple(s['dash']) for s in report['styles']},{(4,2),(2,3)})

class CompleteSymbolLegendTests(unittest.TestCase):
 def test_every_active_symbol_kind_is_explained_and_inactive_kinds_are_absent(self):
  from cartography.symbols import PATHS,symbol_svg
  spec=MapSpec.from_dict({'id':'other-region','title':'Other','bbox':[0,0,.1,.1]})
  kinds=set(PATHS)|{'wp','wp2'}
  root=ET.fromstring('<div>'+transport_legend({'spec':spec,'report':{'styles':[],'facilitySymbols':{k:1 for k in kinds}}})+'</div>')
  explained=set()
  for svg in root.findall('.//svg[@data-legend-symbols]'):
   explained.update(svg.get('data-legend-symbols').split())
  self.assertEqual(explained,kinds)
  root=ET.fromstring('<div>'+transport_legend({'spec':spec,'report':{'styles':[],'facilitySymbols':{'bus':3,'parking':2}}})+'</div>')
  self.assertEqual({x.get('data-legend-symbols') for x in root.findall('.//svg[@data-legend-symbols]')},{'bus','parking'})
 def test_authored_builders_and_shared_symbols_use_the_same_glyph_at_the_same_anchor(self):
  import ast,cartography.symbols as symbols
  for filename,func in [('build_interactive.py','_sym'),('build_static.py','_symbol_svg')]:
   tree=ast.parse((Path(__file__).resolve().parents[2]/'pipeline'/filename).read_text());definition=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==func)
   namespace={**vars(symbols),'P':lambda lat,lon:(0.,0.)};exec(compile(ast.Module(body=[definition],type_ignores=[]),filename,'exec'),namespace)
   for kind in ['camp','th','water','shelter','lodge','bridge','view','peak','spring','wp','wp2','falls']:
    with self.subTest(filename=filename,kind=kind):
     actual=namespace[func](kind) if func=='_sym' else namespace[func](kind,0,0)
     self.assertEqual(actual,symbols.symbol_svg(kind))

if __name__=='__main__':unittest.main()
