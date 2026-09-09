"""Land interests must not look like another trail or imply trail access."""
import sys, unittest
from copy import deepcopy
from pathlib import Path
from xml.etree import ElementTree as ET
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from cartography.scene import render_scene
from label_manifest import Manifest
from map_spec import MapSpec

class BoundaryStyleTests(unittest.TestCase):
 def feature(self, category=None, offset=0, name='Arbitrary Park'):
  ring=[[.01,.01],[.09,.01],[.09,.09],[.01,.09],[.01,.01]]
  hole=[[.03,.03],[.04,.03],[.04,.04],[.03,.04],[.03,.03]]
  return {'id':'source:area','provider':'arbitrary','kind':'boundary','name':name,
          'tags':{},'properties':{} if category is None else {'category':category},
          'geometry':{'type':'Polygon','coordinates':[[[x+offset,y+offset] for x,y in r] for r in (ring,hole)]}}

 def test_scene_distinguishes_boundary_meaning_without_changing_geometry_or_catalog(self):
  previous=None
  for category,key in [('Designation','designation'),('Fee','ownership'),('Easement','easement'),(None,'unknown')]:
   f=self.feature(category);before=deepcopy(f);m=Manifest()
   groups,report=render_scene([f],[],MapSpec.from_dict({'id':'test','title':'Test','bbox':[0,0,.1,.1]}),m)
   path=ET.fromstring(groups['boundaries']).find('path')
   self.assertEqual(path.get('data-boundary-kind'),key)
   self.assertEqual(path.get('data-source-id'),f['id']);self.assertEqual(path.get('fill-rule'),'evenodd')
   self.assertEqual(path.get('d').count('Z'),2);self.assertEqual(f,before)
   if previous:self.assertEqual(path.get('d'),previous)
   previous=path.get('d')
   st=report['boundaryStyles'][0];self.assertEqual(st['key'],key)
   self.assertIn('stroke:var('+st['color']+')',path.get('style'))
   self.assertIn(f'stroke-width:calc({st["width"]}px * var(--s))',path.get('style'))
   self.assertIn(f'opacity:{st["opacity"]}',path.get('style'))
   self.assertIn('stroke-dasharray:'+','.join(f'calc({n}px * var(--s))' for n in st['dash']),path.get('style'))
   self.assertTrue(all(a['layer']=='boundaries' and a['text']==f['name'] for a in m.annotations))
   self.assertEqual(len(m.annotations[0]['areaPolygons'][0]),2)
   self.assertNotIn('access',path.attrib);self.assertNotIn('data-layout-obstacle',path.attrib)

 def test_explicit_categories_override_designation_tags_and_do_not_infer_access(self):
  from cartography.boundaries import boundary_style
  for category,key in [('Fee','ownership'),(' EASEMENT ','easement'),('Designation','designation'),('unrecognized','unknown')]:
   for container in ('properties','tags'):
    f=self.feature();f['tags']={'boundary':'protected_area','access':'private','Des_Tp':'NP'}
    f[container]['Category']=category
    self.assertEqual(boundary_style(f)['key'],key)
  for tags,key in [({'boundary':'protected_area'},'designation'),({'boundary':'national_park'},'designation'),({'boundary':'administrative'},'unknown'),({'access':'no','name':'National Park'},'unknown')]:
   f=self.feature();f['tags']=tags;self.assertEqual(boundary_style(f)['key'],key)

 def test_style_is_independent_of_name_position_and_returns_fresh_arrays(self):
  from cartography.boundaries import boundary_style
  for category in ['Fee','Designation','Easement',None]:
   a=boundary_style(self.feature(category));b=boundary_style(self.feature(category,36,'Renamed Area'))
   self.assertEqual(a,b);self.assertLess(a['width'],1.3)
   a['dash'].append(100);self.assertNotEqual(a,b)
   self.assertNotIn('access',b);self.assertGreater(b['opacity'],0)
  self.assertLess(boundary_style(self.feature('Fee'))['width'],boundary_style(self.feature('Designation'))['width'])
  self.assertLess(boundary_style(self.feature('Easement'))['width'],boundary_style(self.feature('Designation'))['width'])

if __name__=='__main__':unittest.main()
