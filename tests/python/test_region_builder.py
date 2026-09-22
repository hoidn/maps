import unittest,tempfile,subprocess,sys,json,re,importlib.util
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
loader=importlib.util.spec_from_file_location('fixture',ROOT/'tests/support/build-fixture.py')
fixture=importlib.util.module_from_spec(loader);loader.loader.exec_module(fixture)
class RegionBuilderTests(unittest.TestCase):
 def test_custom_region_builds_both_modes_from_its_own_registered_sources(self):
  with tempfile.TemporaryDirectory() as tmp:
   config=fixture.create_region(tmp)
   for mode in ('static','interactive'):
    with self.subTest(mode=mode):
     run=subprocess.run([sys.executable,str(ROOT/'pipeline/build_region.py'),'--map',str(config),'--mode',mode],cwd=tmp,capture_output=True,text=True)
     self.assertEqual(run.returncode,0,run.stderr)
     html=(Path(tmp)/f'sequoia_trails_{mode}.html').read_text()
     manifest=json.loads(re.search(r'id="map-label-manifest">(.*?)</script>',html,re.S)[1])
     self.assertEqual(manifest['map']['frame']['bbox'],json.loads(config.read_text())['bbox'])
     self.assertEqual(manifest['map']['requiredRoutes'],[])
     self.assertEqual(len(re.findall('data-layout-id=',html)),len(manifest['annotations']))
     self.assertGreater(len(manifest['annotations']),5)
     peak=next(f for f in manifest['features'] if f.get('sourceId')=='osm:synthetic:peak')
     self.assertAlmostEqual(peak['anchor'][0],160,6);self.assertAlmostEqual(peak['anchor'][1],80,6)
     self.assertTrue('Synthetic Regional Fixture' in html,'Synthetic Regional Fixture');self.assertTrue('synthetic-test-only' in html,'synthetic-test-only')
     self.assertTrue('data:font/ttf;base64,' in html,'data:font/ttf;base64,');self.assertTrue('data:image/jpeg;base64,' in html,'data:image/jpeg;base64,')
     terrain_images=re.findall(r'<image\b[^>]*class="terrain [^"]*"[^>]*>',html)
     self.assertEqual(len(terrain_images),2)
     self.assertTrue(all('preserveAspectRatio="none"' in image for image in terrain_images),'Registered relief must fill the geographic frame, even when grid and ground aspects differ')
     self.assertTrue('id="map-layout-runtime"' in html,'id="map-layout-runtime"')
     self.assertTrue('not for navigation' in html,'not for navigation')
     if mode=='static':
      self.assertTrue('data-renderer="svg"' in html,'data-renderer="svg"')
      for text in ('class="ctl"','id="readout"','// ---- cursor DEM','Drag to pan','id="map-interaction"','class="hit"','id="map-contour-payload"'):
       self.assertFalse(text in html,text)
      self.assertIsNotNone(re.search(r'<path class="c[ix][^"]*"[^>]* d="M',html),'Static contours must remain inline SVG')
      self.assertTrue('Trail Sheet</title>' in html,'Trail Sheet</title>')
     else:
      for text in ('class="ctl"','id="readout"','// ---- cursor DEM','Drag to pan','id="map-interaction"','class="hit"'):
       self.assertTrue(text in html,text)
 def test_missing_essential_cache_is_reported_before_generation(self):
  with tempfile.TemporaryDirectory() as tmp:
   run=subprocess.run([sys.executable,str(ROOT/'pipeline/build_region.py'),'--map','san_gabriel'],cwd=tmp,capture_output=True,text=True)
   self.assertNotEqual(run.returncode,0)
   for name in ('features.json','dem.npy','dem.json'):self.assertIn(name,run.stderr)
