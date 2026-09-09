import sys,unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from hillshade import illuminate

class HillshadeTests(unittest.TestCase):
    def test_cardinal_lights_illuminate_slopes_facing_them(self):
        # gx is eastward rise; gy is southward rise because array rows run south.
        gradients=[(0,1),(-1,0),(0,-1),(1,0)]
        for azimuth,(gx,gy) in zip([0,90,180,270],gradients):
            self.assertAlmostEqual(float(illuminate(gx,gy,azimuth,45,exaggeration=1)),1)
            self.assertAlmostEqual(float(illuminate(gx,gy,(azimuth+180)%360,45,exaggeration=1)),0)

    def test_northwest_is_brighter_than_southeast_under_northwest_light(self):
        self.assertGreater(illuminate(1,1,315,45),illuminate(-1,-1,315,45))

    def test_flat_surface_depends_only_on_light_altitude(self):
        for azimuth in range(0,360,45):
            self.assertAlmostEqual(float(illuminate(0,0,azimuth,30)),.5)

    def test_vector_result_matches_independent_surface_normal_dot_product(self):
        rng=np.random.default_rng(42);gx=rng.normal(size=(9,7));gy=rng.normal(size=(9,7))
        normals=np.stack([-gx*1.15,gy*1.15,np.ones_like(gx)],axis=-1)
        normals/=np.linalg.norm(normals,axis=-1)[...,None]
        az=np.radians(315);alt=np.radians(45)
        light=np.array([np.sin(az)*np.cos(alt),np.cos(az)*np.cos(alt),np.sin(alt)])
        np.testing.assert_allclose(illuminate(gx,gy,315,45),np.clip(normals@light,0,1),atol=1e-12)
