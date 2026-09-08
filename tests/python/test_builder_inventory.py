import unittest, tempfile, importlib.util, subprocess, sys, json, re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('fixture',ROOT/'tests/support/build-fixture.py')
fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture)
class BuilderTests(unittest.TestCase):
    def test_both_builders_emit_complete_manifest_with_no_network_assets(self):
        for mode in ('static','interactive'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as temp:
                fixture.create(temp)
                run=subprocess.run([sys.executable,str(ROOT/f'pipeline/build_{mode}.py')],cwd=temp,capture_output=True,text=True)
                self.assertEqual(run.returncode,0,run.stderr)
                filename='grand_canyon_trails.html' if mode=='static' else 'grand_canyon_trails_interactive.html'
                text=(Path(temp)/filename).read_text()
                manifest=json.loads(re.search(r'id="map-label-manifest">(.*?)</script>',text,re.S)[1])
                self.assertEqual(len(re.findall('data-layout-id=',text)),len(manifest['annotations']))
                self.assertGreater(len(manifest['annotations']),100)
                self.assertNotIn('fonts.googleapis.com',text)
                names={f['name'] for f in manifest['features'] if f['directory']}
                self.assertTrue({'Silver Bridge','Santa Maria Spring','Phantom Ranch'}.issubset(names))
