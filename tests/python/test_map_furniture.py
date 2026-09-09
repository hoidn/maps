import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from map_spec import MapSpec
from cartography.furniture import scale_distance,grid,detail_inset
class FurnitureTests(unittest.TestCase):
 def test_scale_is_nice_and_matches_ground_units(self):
  for mpp in (1,12,32,100):
   meters,pixels=scale_distance(mpp,120)
   self.assertLessEqual(pixels,120);self.assertAlmostEqual(pixels*mpp,meters)
 def test_grid_uses_region_coordinates_and_inset_is_not_invented(self):
  s=MapSpec.load('sequoia');g=grid(s)
  self.assertIn('118.',g);self.assertNotIn('112.',g)
  self.assertEqual(detail_inset([],s),'')
 def test_grid_text_stays_inside_aligned_frame_and_uses_step_precision(self):
  import xml.etree.ElementTree as ET
  for bbox in ([0,0,.1,.1],[0,0,.001,.001]):
   s=MapSpec.from_dict({'id':'test','title':'Test','bbox':bbox});root=ET.fromstring(grid(s));texts=list(root.iter('text'))
   self.assertTrue(all(0<=float(t.get('x'))<s.width and 0<float(t.get('y'))<s.height for t in texts))
   self.assertEqual(len({t.text for t in texts}),len(texts))

 def test_static_legend_omits_interactive_selection_instructions(self):
  from cartography.integration import transport_legend
  context={'spec':MapSpec.load('sequoia'),'report':{'styles':[]},'mode':'static'}
  self.assertNotIn('Select a trail',transport_legend(context))
  context['mode']='interactive'
  self.assertIn('Select a trail',transport_legend(context))
