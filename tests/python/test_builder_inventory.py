import unittest, tempfile, importlib.util, subprocess, sys, re, xml.etree.ElementTree as ET
from pathlib import Path
from html_json import read_json
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
                manifest=read_json(text,'map-label-manifest')
                self.assertEqual(len(re.findall('data-layout-id=',text)),len(manifest['annotations']))
                self.assertGreater(len(manifest['annotations']),100)
                self.assertNotIn('fonts.googleapis.com',text)
                svg=ET.fromstring(re.search(r'<svg[^>]*id="mapsvg".*?</svg>',text,re.S)[0])
                if mode=='interactive':
                    trails=[e for e in svg.iter() if e.get('data-layout-obstacle')=='trail']
                    hits=[e for e in svg.iter() if e.get('class')=='hit']
                    self.assertTrue(trails)
                    self.assertEqual(sorted(e.get('d') for e in trails), sorted(e.get('d') for e in hits))
                    self.assertRegex(trails[0].get('d'), r'M-?\d+\.\d{3},-?\d+\.\d{3}')
                parents={child:parent for parent in svg.iter() for child in parent}
                for node in svg.iter():
                    is_text=node.tag.endswith('}text')
                    is_symbol=any(c.startswith('s-') for c in node.get('class','').split())
                    if not (is_text or is_symbol): continue
                    ancestry=[]; ancestor=node
                    while ancestor in parents:
                        ancestor=parents[ancestor]; ancestry.append(ancestor)
                    if any(set(a.get('class','').split()) & {'fixed-ui','cartouche','scale'} for a in ancestry):continue
                    self.assertTrue(any(a.get('data-layout-id') for a in ancestry),ET.tostring(node).decode())
                names={f['name'] for f in manifest['features'] if f['directory']}
                self.assertTrue({'Silver Bridge','Santa Maria Spring','Phantom Ranch'}.issubset(names))
