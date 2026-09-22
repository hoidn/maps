"""Lossless interactive contour packing preserves the authored SVG boundary."""
import base64, sys, unittest, zlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from cartography.contour_payload import pack_contours
from html_json import read_json

class ContourPayloadTests(unittest.TestCase):
 def test_tiers_pack_exact_polylines_without_changing_identity_or_style(self):
  svg='<svg id="mapsvg"><defs><path id="unrelated" d="M0.000,0.000 1.000,1.000"/></defs><g class="contours" opacity=".4"><g class="g-finest"><path id="fine" class="ci cff" d="M-2.125,3.000 4.500,5.001M6.250,7.125 6.500,7.000"/></g><path id="coarse" class="cx" stroke="red" d="M0.000,0.000 1.000,1.000"/></g></svg>'
  packed,script=pack_contours(svg)
  self.assertIn('id="fine" class="ci cff" d="" data-packed-contour="0"',packed)
  self.assertIn('id="coarse" class="cx" stroke="red" d="" data-packed-contour="1"',packed)
  self.assertIn('<defs><path id="unrelated" d="M0.000,0.000 1.000,1.000"/></defs>',packed)
  manifest=read_json(script,'map-contour-payload')
  self.assertEqual(manifest['version'],1);self.assertEqual(manifest['encoding'],'delta2-varint');self.assertEqual(manifest['scale'],1000)
  self.assertEqual([t['zoom'] for t in manifest['tiers']],[0,4.5])
  self.assertEqual([t['ids'] for t in manifest['tiers']],[[1],[0]])
  for tier in manifest['tiers']:
   raw=base64.b64decode(tier['data'],validate=True);self.assertEqual(tier['crc32'],zlib.crc32(raw));self.assertEqual(tier['bytes'],len(raw))

 def test_static_and_unsupported_geometry_remain_byte_identical(self):
  paths=['M0.000,0.000 C1.000,2.000 3.000,4.000 5.000,6.000','M0,0 1,1','M-0.000,0.000 1.000,1.000','M2147484.000,0.000 1.000,1.000']
  for path in paths:
   svg='<svg><g class="contours"><path d="'+path+'"/></g></svg>'
   with self.subTest(path=path):self.assertEqual(pack_contours(svg),(svg,''))
  svg='<svg><g class="contours"><path d="M0.000,0.000 1.000,1.000"/></g></svg>'
  self.assertEqual(pack_contours(svg,mode='static'),(svg,''))

 def test_supported_paths_can_pack_beside_unsupported_source_without_filtering(self):
  svg='<svg><g class="contours"><path class="arbitrary" d="M0.000,0.000 1.000,1.000"/><path id="curve" d="M0,0 Q1,2 3,4"/></g><g class="trails"><path d="M0.000,0.000 1.000,1.000"/></g></svg>'
  packed,script=pack_contours(svg)
  self.assertEqual(packed.count('data-packed-contour='),1);self.assertIn('<path id="curve" d="M0,0 Q1,2 3,4"/>',packed);self.assertIn('<g class="trails"><path d="M0.000,0.000 1.000,1.000"/></g>',packed)

if __name__=='__main__':unittest.main()
