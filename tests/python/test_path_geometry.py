import sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from path_geometry import detail_path, detail_points

class DetailGeometryTests(unittest.TestCase):
    def test_retains_small_switchbacks_discarded_at_overview_tolerance(self):
        pts=np.array([[0,0],[1,.2],[2,.08],[3,-.2],[4,0]])
        self.assertEqual(len(detail_points(pts)),5)
        self.assertIn('1.000,0.200',detail_path(pts))

    def test_maximum_zoom_error_stays_below_half_a_map_pixel(self):
        pts=np.column_stack([np.linspace(0,20,1001),np.sin(np.linspace(0,20,1001))])
        output=detail_points(pts)
        for point in pts:
            distances=[]
            for a,b in zip(output,output[1:]):
                d=b-a;t=np.clip(np.dot(point-a,d)/np.dot(d,d),0,1)
                distances.append(np.linalg.norm(point-a-t*d))
            self.assertLessEqual((min(distances)+.001)*14,.5)
        np.testing.assert_equal(output[[0,-1]],pts[[0,-1]])

    def test_preserves_sub_tenth_coordinate_precision(self):
        self.assertEqual(detail_path([[1.024,2.036],[2.024,3.036]]),'M1.024,2.036 2.024,3.036')
