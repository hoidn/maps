import unittest,sys,tempfile,json
from pathlib import Path
from unittest.mock import patch
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from map_spec import MapSpec
from sources.catalog import atomic_json,sha256
from cartography.catalog import load_catalog
import build_region,fetch_region
class PortableCacheTests(unittest.TestCase):
 def spec(self):return MapSpec.from_dict({'id':'test','title':'Test','bbox':[0,0,1,1],'width':4,'height':4,'sources':['osm','gnis','3dhp','padus','nlcd','3dep']})
 def base(self,root,spec):
  path=Path(root)/spec.id;path.mkdir();atomic_json(path/'features.json',{'frame':spec.frame,'features':[],'routes':[],'issues':[]});return path
 def test_national_catalog_rejects_unframed_or_wrong_frame(self):
  for data in [[],{'features':[]},{'frame':MapSpec.load('sequoia').frame,'features':[]}]:
   with self.subTest(data=data),tempfile.TemporaryDirectory() as tmp:
    spec=self.spec();root=self.base(tmp,spec);atomic_json(root/'gnis-features.json',data)
    with self.assertRaisesRegex(ValueError,'frame'):load_catalog(spec,tmp)
 def test_missing_requested_sources_and_rejected_features_are_recorded(self):
  with tempfile.TemporaryDirectory() as tmp:
   spec=self.spec();root=self.base(tmp,spec);atomic_json(root/'boundaries-features.json',{'frame':spec.frame,'features':[],'issues':[{'id':'x','reason':'Incomplete source polygon'}]})
   catalog=load_catalog(spec,tmp)
   self.assertIn('gnis',catalog['sourceInventory']['missing']);self.assertNotIn('padus',catalog['sourceInventory']['missing'])
   self.assertEqual(catalog['sourceIssues']['boundaries'][0]['id'],'x');self.assertEqual(catalog['sourceIssueCounts']['boundaries'],1)
 def test_refresh_wraps_national_features_with_frame_and_issues(self):
  spec=self.spec();feature={'id':'padus:1'}
  with patch('sources.boundaries.fetch',return_value=([feature],[{'id':'bad'}])),patch('fetch_region.atomic_json') as write:
   fetch_region.refresh(spec,'boundaries')
  result=write.call_args.args[1];self.assertIsInstance(result,dict);self.assertEqual(result['frame'],spec.frame);self.assertEqual(result['features'],[feature]);self.assertEqual(result['issues'],[{'id':'bad'}])
 def dem(self,root,spec):
  path=Path(root);np.save(path/'dem.npy',np.ones((4,4),dtype=np.float32))
  meta={'frame':spec.frame,'shape':[4,4],'arraySha256':sha256(path/'dem.npy'),'dtype':'float32','units':'metres','registration':{'bbox':list(spec.bbox),'pixelRegistration':'area','sampleLocation':'center'}}
  atomic_json(path/'dem.json',meta);return meta
 def test_portable_dem_rejects_changed_array_even_with_same_shape(self):
  with tempfile.TemporaryDirectory() as tmp:
   spec=self.spec();self.dem(tmp,spec);np.save(Path(tmp)/'dem.npy',np.full((4,4),2,dtype=np.float32))
   with self.assertRaisesRegex(ValueError,'hash'):build_region.load_dem(spec,Path(tmp))
 def test_portable_dem_accepts_registered_array_and_rejects_nonfinite(self):
  with tempfile.TemporaryDirectory() as tmp:
   spec=self.spec();meta=self.dem(tmp,spec);array,digest=build_region.load_dem(spec,Path(tmp));self.assertEqual(digest,meta['arraySha256'])
   np.save(Path(tmp)/'dem.npy',np.full((4,4),np.nan,dtype=np.float32));meta['arraySha256']=sha256(Path(tmp)/'dem.npy');atomic_json(Path(tmp)/'dem.json',meta)
   with self.assertRaisesRegex(ValueError,'samples'):build_region.load_dem(spec,Path(tmp))
 def test_landcover_cache_must_match_its_array_hash(self):
  with tempfile.TemporaryDirectory() as tmp:
   spec=self.spec();root=self.base(tmp,spec);np.save(root/'landcover.npy',np.full((4,4),42,dtype=np.uint8))
   atomic_json(root/'landcover.json',{'frame':spec.frame,'bbox':list(spec.bbox),'shape':[4,4],'dtype':'uint8','arraySha256':'outdated'})
   with self.assertRaisesRegex(ValueError,'hash'):load_catalog(spec,tmp)

 def test_integration_retains_custom_spec_instead_of_reloading_same_id(self):
  from cartography.integration import improve
  from label_manifest import Manifest
  from dataclasses import replace
  import os
  spec=replace(MapSpec.load('sequoia'),title='Custom frame',bbox=(-118.5,34.1,-118.4,34.2),width=400,height=400)
  with tempfile.TemporaryDirectory() as tmp:
   cache=Path(tmp)/'cache';cache.mkdir();self.base(cache,spec)
   old=Path.cwd()
   try:
    os.chdir(tmp)
    svg,context=improve('<svg xmlns="http://www.w3.org/2000/svg"/>',Manifest('static',400,400),np.ones((4,4),dtype=np.float32),spec)
   finally:os.chdir(old)
   self.assertIs(context['spec'],spec)
   self.assertEqual(context['report']['frame'],spec.frame)
