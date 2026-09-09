import sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from path_geometry import contour_points

class RasterRegistrationTests(unittest.TestCase):
    def test_pixel_area_contours_align_with_image_pixel_centers(self):
        actual=contour_points([[0,0],[1,1]],width=2,height=2,map_width=100,map_height=80)
        np.testing.assert_equal(actual,[[25,20],[75,60]])

    def test_fractional_contour_locations_preserve_interpolation(self):
        actual=contour_points([[.5,1.5]],width=4,height=2,map_width=100,map_height=80)
        np.testing.assert_equal(actual,[[50,40]])
