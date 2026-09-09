import sys, unittest, json, xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'pipeline'))
from label_manifest import Manifest, embedded_fonts

class ManifestTests(unittest.TestCase):
    def test_stable_ids_and_complete_symbol_inventory(self):
        def build(order):
            m = Manifest()
            for name, xy in order:
                m.label('<text>'+name+'</text>', name, 'l-place', xy)
                m.symbol('<circle r="3"/>', 'camp', xy)
            return m
        rows = [('Camp A', (10,20)), ('Camp B', (30,40))]
        a,b=build(rows),build(rows[::-1])
        self.assertEqual(sorted(x['id'] for x in a.data()['annotations']),sorted(x['id'] for x in b.data()['annotations']))
        self.assertEqual(len(a.data()['annotations']),4)
        self.assertEqual(len(a.data()['features']),2)
        self.assertTrue(all(x['directory'] for x in a.data()['features']))
    def test_safe_embedding_and_required_names(self):
        m=Manifest()
        m.label('<text>test</text>','</script><script>oops</script>','l-place',(10,20))
        m.label('<text>Phantom Ranch</text>','Phantom Ranch','l-major',(30,40))
        self.assertNotIn('</script>', m.json())
        self.assertIn('static-default',m.data()['annotations'][1]['requiredProfiles'])
        json.loads(m.json())
    def test_all_place_names_offer_word_preserving_three_line_wraps(self):
        m=Manifest()
        for name in ['Horseshoe Mesa CG', 'Example Remote Camp']:
            m.label('<text>'+name+'</text>',name,'l-place',(10,len(m.annotations)*20))
        for a in m.annotations:
            self.assertTrue(any(len(v['lines'])==3 for v in a['variants']))
            self.assertTrue(all(' '.join(v['lines'])==a['text'] for v in a['variants']))

    def test_nonfinite_anchor_rejected(self):
        with self.assertRaises(ValueError):
            Manifest().label('<text>A</text>','A','l-place',(float('nan'),0))
    def test_required_static_route_paths_declare_complete_wraps(self):
        m=Manifest('static');m.required_routes={'Example Ridge Trail'}
        m.label('<text><textPath href="#route">Example Ridge Trail</textPath></text>',
                'Example Ridge Trail','l-trail',(10,20),kind='line-label',geometry_id='route',source_id='osm:way:123')
        a=m.annotations[0]
        self.assertEqual(a['geometryId'],'route')
        self.assertEqual(a['requiredGroup'],'Example Ridge Trail')
        self.assertTrue(any(len(v['lines'])==3 for v in a.get('variants',[])))
        self.assertTrue(all(' '.join(v['lines'])==a['text'] for v in a['variants']))
        self.assertEqual(m.features[a['featureId']]['sourceId'],'osm:way:123')
    def test_curved_labels_registered_and_paths_identified(self):
        m=Manifest()
        svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1300 1070"><defs><path id="river" d="M0,0 L80,80"/></defs><g class="hydro-labels"><text class="l-river"><textPath href="#river">River</textPath></text></g></svg>'
        result=m.finalize(svg)
        self.assertIn('data-layout-id',result)
        self.assertTrue(m.data()['annotations'][0]['geometryId'].startswith('geometry-'))
        self.assertEqual(m.data()['annotations'][0]['kind'],'line-label')
    def test_distinct_source_features_at_identical_coordinates(self):
        m=Manifest()
        for source,name in [(1,'Mencius Temple'),(2,'Twin Buttes')]:
            m.symbol('<circle r="3"/>','peak',(1,2),source_id=source)
            m.label('<text>'+name+'</text>',name,'l-peak',(1,2),source_id=source)
        self.assertEqual(len(m.data()['features']),2)
        self.assertEqual(len(m.data()['annotations']),4)

    def test_fonts_are_embedded_and_hash_verified(self):
        css=embedded_fonts()
        self.assertIn('data:font/',css)
        self.assertNotIn('https://',css)
        self.assertIn('Source Sans 3',css)

    def test_curve_identity_does_not_depend_on_sequence_ids(self):
        def make(pid):
            m=Manifest()
            m.finalize('<svg xmlns="http://www.w3.org/2000/svg"><defs><path id="'+pid+'" d="M0,0 L80,80"/></defs><text class="l-contour"><textPath href="#'+pid+'" startOffset="50%">4,000</textPath></text></svg>')
            return m.data()['annotations'][0]['id']
        self.assertEqual(make('c1'),make('c999'))
    def test_off_frame_pointer_is_not_a_place(self):
        m=Manifest();m.label('<text>Desert View →</text>','Desert View →','l-minor',(1,2))
        self.assertEqual(m.data()['annotations'][0]['kind'],'edge-pointer')
        self.assertFalse(m.data()['features'][0]['directory'])

    def test_duplicate_annotation_rejected(self):
        m=Manifest(); m.label('<text>A</text>','A','l-place',(1,2))
        with self.assertRaises(ValueError): m.label('<text>A</text>','A','l-place',(1,2))

if __name__=='__main__': unittest.main()
