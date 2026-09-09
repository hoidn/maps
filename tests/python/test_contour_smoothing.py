import sys, unittest
from pathlib import Path
import numpy as np
from shapely.geometry import LineString, Polygon
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from contour_smoothing import smooth_paths

class ContourSmoothingTests(unittest.TestCase):
    def test_rounds_corner_with_bounded_error_and_fixed_endpoints(self):
        source=np.array([[0.,0.],[2,0],[2,2]])
        result,report=smooth_paths([source],.4)
        out=result[0]
        np.testing.assert_equal(out[[0,-1]],source[[0,-1]])
        self.assertGreater(len(out),len(source))
        self.assertLess(LineString(source).hausdorff_distance(LineString(out)),.4)
        self.assertTrue(LineString(out).is_simple)
        self.assertEqual(report['smoothed'],1)

    def test_preserves_narrow_gap_between_neighbors(self):
        paths=[np.array([[0.,0.],[2,0],[2,2]]), np.array([[0.,.04],[1.96,.04],[1.96,2]])]
        out,_=smooth_paths(paths,.4)
        original=LineString(paths[0]).distance(LineString(paths[1]))
        self.assertGreaterEqual(LineString(out[0]).distance(LineString(out[1])),original*.5-1e-6)
        self.assertFalse(LineString(out[0]).intersects(LineString(out[1])))

    def test_preserves_closed_loop_and_nested_contour(self):
        paths=[np.array([[0.,0.],[4,0],[4,4],[0,4],[0,0]]),np.array([[.03,.03],[.1,.03],[.1,.1],[.03,.1],[.03,.03]])]
        out,_=smooth_paths(paths,.5)
        for p in out:self.assertTrue(LineString(p).is_ring)
        self.assertTrue(Polygon(out[0]).contains(Polygon(out[1])))
        self.assertTrue(Polygon(out[0]).exterior.is_ccw)

    def test_existing_self_intersection_is_preserved_and_reported(self):
        p=np.array([[0.,0.],[2,2],[0,2],[2,0]])
        out,report=smooth_paths([p],.5)
        np.testing.assert_equal(out[0],p)
        self.assertEqual(report['sourceNonSimple'],1)

    def test_deterministic_and_independent_of_path_order(self):
        paths=[np.array([[0.,0.],[2,0],[2,2]]),np.array([[0.,1.],[1,1],[1,2]])]
        a,_=smooth_paths(paths,.3);b,_=smooth_paths(paths[::-1],.3)
        for x,y in zip(a,b[::-1]):np.testing.assert_equal(x,y)

    def test_quantization_does_not_collapse_very_close_unchanged_lines(self):
        paths=[np.array([[0.,.0001],[2,.0001],[2,2.0001]]),np.array([[0.,.0002],[1.9999,.0002],[1.9999,2.0001]])]
        out,_=smooth_paths(paths,.4)
        self.assertGreater(LineString(out[0]).distance(LineString(out[1])),0)

    def test_cache_registration_is_applied_once(self):
        import json,tempfile
        from smooth_terrain import smooth_cache
        with tempfile.TemporaryDirectory() as d:
            cache=Path(d)/'terrain.json';dem=Path(d)/'dem.npy'
            np.save(dem,np.zeros((1070,1300),dtype=np.float32))
            cache.write_text(json.dumps({'contours':{'index':[{'lv':100,'d':['M0,0 2,0 2,2']}]}}))
            smooth_cache(cache,dem,smooth=False)
            first=cache.read_bytes();smooth_cache(cache,dem,smooth=False)
            self.assertEqual(first,cache.read_bytes())
            self.assertEqual(json.loads(first)['contours']['index'][0]['d'],['M0.500,0.500 2.500,0.500 2.500,2.500'])

    def test_subpixel_bends_do_not_expand_the_geometry(self):
        p=np.array([[0.,0.],[1,.001],[2,0]])
        out,report=smooth_paths([p],.2)
        np.testing.assert_equal(out[0],p)
        self.assertEqual(report['corners'],0)

    def test_many_nested_contours_preserve_all_pairwise_gaps(self):
        paths=[]
        for size in np.linspace(.05,4,15):
            paths.append(np.array([[-size,-size],[size,-size],[size,size],[-size,size],[-size,-size]]))
        out,_=smooth_paths(paths,.5)
        for i in range(len(paths)):
            for j in range(i):
                original=LineString(paths[i]).distance(LineString(paths[j]))
                actual=LineString(out[i]).distance(LineString(out[j]))
                self.assertGreaterEqual(actual,original*.5-1e-6)

    def test_reports_existing_cross_contour_intersections(self):
        paths=[np.array([[0.,0.],[2,2]]),np.array([[0.,2.],[2,0]])]
        _,report=smooth_paths(paths,.2)
        self.assertEqual(report['sourceIntersections'],1)
        self.assertEqual(report['newIntersections'],0)
