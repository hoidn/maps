import unittest,sys,io,tempfile
from pathlib import Path
import numpy as np,tifffile
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from map_spec import MapSpec
from sources import elevation,landcover
class RasterSourceTests(unittest.TestCase):
 def spec(self):return MapSpec.from_dict({'id':'fixture','title':'Test','bbox':[-2,1,2,3],'width':4,'height':2})
 def test_dem_registration_shape_and_nodata_are_enforced(self):
  spec=self.spec();array=np.ones((2,4),dtype=np.float32)
  elevation.validate_grid(array,spec.bbox,spec,(2,4))
  for arr,bbox in [(array,[-2,1,2.1,3]),(array[:1],spec.bbox),(array*np.nan,spec.bbox),(array*-999999,spec.bbox)]:
   with self.assertRaises(ValueError):elevation.validate_grid(arr,bbox,spec,(2,4))
 def test_categorical_sampling_uses_pixel_centers_and_never_blends(self):
  source=np.array([[11,42],[52,31]],dtype=np.uint8)
  result=landcover.sample_categories(source,(0,0,2,2),(0,0,2,2),(4,4))
  self.assertEqual(result.tolist(),[[11,11,42,42],[11,11,42,42],[52,52,31,31],[52,52,31,31]])
 def test_category_validation_rejects_rgb_blended_and_nodata_cells(self):
  for array in [np.zeros((2,2,3),dtype=np.uint8),np.array([[44]],dtype=np.uint8),np.array([[250]],dtype=np.uint8),np.array([[42.5]])]:
   with self.assertRaises(ValueError):landcover.validate_categories(array)
  landcover.validate_categories(np.array([[11,42,95]],dtype=np.uint8))
 def test_tiff_reads_pixel_area_extent_and_rejects_unregistered_images(self):
  bio=io.BytesIO();tifffile.imwrite(bio,np.ones((2,4),dtype=np.float32),extratags=[(33550,'d',3,(1.,1.,0.),False),(33922,'d',6,(0.,0.,0.,-2.,3.,0.),False),(34735,'H',16,(1,1,0,3,1024,0,1,2,1025,0,1,1,2048,0,1,4326),False)])
  a,meta=elevation.read_geotiff(bio.getvalue(),4326);self.assertEqual(meta['bbox'],[-2.,1.,2.,3.])
  bio=io.BytesIO();tifffile.imwrite(bio,np.ones((2,4)))
  with self.assertRaises(ValueError):elevation.read_geotiff(bio.getvalue(),4326)
 def test_dem_resampling_preserves_pixel_center_positions(self):
  array=np.array([[.5,1.5,2.5,3.5],[.5,1.5,2.5,3.5]],dtype=np.float32)
  result=elevation.resample_to_frame(array,[0,0,4,2],[.2,0,3.8,2])
  np.testing.assert_allclose(result[0],[.65,1.55,2.45,3.35],atol=1e-6)
 def test_native_nlcd_edges_snap_to_the_grid_origin_not_zero(self):
  grid={'epsg':5070,'edgeOrigin':[-2415585,3314805],'pixelSize':[30,30]}
  self.assertEqual(landcover.snap_native_bounds([-2014050,1721520,-1974120,1758900],grid),[-2014065,1721505,-1974105,1758915])
 def test_native_nlcd_grid_description_preserves_center_and_edge_origins(self):
  xml='''<wcs:CoverageDescription xmlns:wcs="http://www.opengis.net/wcs" xmlns:gml="http://www.opengis.net/gml"><wcs:CoverageOffering><wcs:domainSet><wcs:spatialDomain><gml:RectifiedGrid dimension="2" srsName="EPSG:5070"><gml:limits><gml:GridEnvelope><gml:low>0 0</gml:low><gml:high>159999 104999</gml:high></gml:GridEnvelope></gml:limits><gml:origin><gml:pos>-2415570 3314790</gml:pos></gml:origin><gml:offsetVector>30 0</gml:offsetVector><gml:offsetVector>0 -30</gml:offsetVector></gml:RectifiedGrid></wcs:spatialDomain></wcs:domainSet></wcs:CoverageOffering></wcs:CoverageDescription>'''
  grid=landcover.native_grid(xml)
  self.assertEqual(grid['edgeOrigin'],[-2415585,3314805]);self.assertEqual(grid['centerOrigin'],[-2415570,3314790]);self.assertEqual(grid['shape'],[105000,160000])
