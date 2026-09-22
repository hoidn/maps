import sys, unittest
from pathlib import Path
from html_json import read_json
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'pipeline'))
from map_spec import MapSpec
from cartography import print_sheet

class PrintSheetTests(unittest.TestCase):
    def test_authored_annotations_are_scaled_about_geographic_anchors(self):
        import xml.etree.ElementTree as ET
        from types import SimpleNamespace
        from label_manifest import NS
        tree=ET.fromstring(f'<svg xmlns="{NS}"><g data-layout-id="authored"><text x="105" y="107">Camp</text></g><g data-layout-id="portable"><text style="transform:scale(var(--k))">Other</text></g></svg>')
        manifest=SimpleNamespace(annotations=[{'id':'authored','anchor':[100,100]}, {'id':'portable','anchor':[200,200]}])
        print_sheet.physical_annotations(tree,manifest)
        self.assertEqual(tree[0][0].get('style'),'transform:translate(100px,100px) scale(var(--k)) translate(-100px,-100px)')
        self.assertEqual(tree[0][0][0].get('x'),'105')
        self.assertEqual(tree[1][0].tag,f'{{{NS}}}text')

    def test_paper_units_and_scale_geometry(self):
        self.assertEqual(print_sheet.parse_paper('36x24in'), [914.4, 609.6])
        self.assertEqual(print_sheet.parse_paper('914.4x609.6mm'), [914.4, 609.6])
        spec = MapSpec.load('sequoia')
        profile = print_sheet.print_profile(spec, scale=50000)
        self.assertIsNone(profile['paperMm'])
        self.assertAlmostEqual(profile['mapWidthMm'], spec.meters_per_map_unit * spec.width / 50)
        self.assertEqual(print_sheet.print_profile(spec)['paperMm'], [914.4, 609.6])
        self.assertEqual(profile['points']['contour'], 7)

    def test_invalid_physical_requests(self):
        for paper in ('0x24in', '-3x2in', '3x4', 'NaNx4mm', '97x24in', '2x2cm'):
            with self.subTest(paper=paper), self.assertRaises(ValueError):
                print_sheet.parse_paper(paper)
        for scale in (0, -1, float('nan'), float('inf')):
            with self.subTest(scale=scale), self.assertRaises(ValueError):
                print_sheet.print_profile(MapSpec.load('sequoia'), scale=scale)

    def test_regional_print_sheet_contains_collar_and_preserves_geometry(self):
        import importlib.util, subprocess, tempfile
        root = Path(__file__).resolve().parents[2]
        loader = importlib.util.spec_from_file_location('fixture', root/'tests/support/build-fixture.py')
        fixture = importlib.util.module_from_spec(loader); loader.loader.exec_module(fixture)
        with tempfile.TemporaryDirectory() as tmp:
            config = fixture.create_region(tmp)
            result = subprocess.run([sys.executable, str(root/'pipeline/build_region.py'), '--map', str(config), '--mode', 'static', '--print', '--paper', '36x24in'], cwd=tmp, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            html = (Path(tmp)/'sequoia_trails_static.html').read_text()
            for token in ('print-collar', 'print-calibration', 'print-north', 'print-ticks', 'Synthetic Camp', 'synthetic-test-only', 'not for navigation', 'Nominal scale', 'Contour interval', 'WGS84'):
                self.assertIn(token, html)
            m = read_json(html,'map-label-manifest')
            self.assertEqual(m['map']['width'],800)
            self.assertEqual(m['map']['print']['paperMm'],[914.4,609.6])
            self.assertNotIn('Drag to pan',html)
