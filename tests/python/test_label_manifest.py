import sys, unittest, json, re, xml.etree.ElementTree as ET
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'pipeline'))
from label_manifest import Manifest, embedded_fonts, stable_id
from html_json import read_json

class ManifestTests(unittest.TestCase):
    def test_large_manifest_uses_bounded_inert_chunks_without_changing_json(self):
        m=Manifest('static');m.map_metadata={'note':'a'*65520+'😀漢é</script><script>alert(1)</script>\u2028\u2029'+'z'*65536}
        m.label('<text>A</text>','A','l-place',(10,20))
        markup=m.script()
        self.assertTrue(markup.startswith('<div hidden data-json-chunks id="map-label-manifest">'))
        self.assertEqual(read_json(markup,'map-label-manifest'),m.data())
        self.assertNotIn('<script>alert',markup)
        chunks=re.findall(r'<script type="application/json">(.*?)</script>',markup)
        self.assertGreater(len(chunks),1)
        self.assertTrue(all(len(chunk.encode('utf8'))<=65536 for chunk in chunks))
        self.assertEqual(''.join(chunks),m.json())

    def test_static_preparation_removes_only_unreferenced_path_definitions(self):
        svg='''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><defs>
        <path id="unused" d="M0,0 L2,2"/>
        <path id="shared" d="M0,0 L30,0"/>
        <path id="paint" d="M0,0 L40,0"/>
        <path id="css" d="M0,0 L50,0"/>
        <path id="linked" d="M0,0 L60,0"/>
        <path id="metadata" d="M0,0 L70,0"/>
        <clipPath id="clip"><rect width="40" height="40"/></clipPath>
        </defs><style>.sample{clip-path:url('#css')}</style>
        <use href="#paint"/><use xlink:href="#linked"/><g class="labels"><text><textPath href="#shared">Retained</textPath></text></g></svg>'''
        # Use content-addressed IDs where the existing normalizer rewrites only
        # href, so these cases exercise live references rather than old aliases.
        for name,d in [('css','M0,0 L50,0'),('linked','M0,0 L60,0')]:
            svg=svg.replace('id="'+name+'"','id="'+stable_id('geometry',d)+'"').replace('#'+name,'#'+stable_id('geometry',d))
        for mode in ('interactive','static'):
            m=Manifest(mode)
            m.symbol('<circle r="1"/>','camp',(1,1));m.annotations[-1]['geometryIds']=[stable_id('geometry','M0,0 L70,0')]
            root=ET.fromstring(m.finalize(svg));ns={'s':'http://www.w3.org/2000/svg'}
            paths=root.findall('s:defs/s:path',ns)
            self.assertEqual({p.get('d') for p in paths}, {'M0,0 L30,0','M0,0 L40,0','M0,0 L50,0','M0,0 L60,0','M0,0 L70,0'} | ({'M0,0 L2,2'} if mode=='interactive' else set()))
            self.assertIsNotNone(root.find('s:defs/s:clipPath',ns))
            self.assertIn(m.annotations[-1]['geometryId'],{p.get('id') for p in paths})

    def test_static_scale_preparation_keeps_sources_required_labels_and_visible_detail(self):
        for mode,profile,removed in [('interactive',None,False),('static',None,True),('static',{'mapWidthMm':1000,'paperMm':None},True),('static',{'mapWidthMm':2000,'paperMm':None},False),('static',{'mapWidthMm':None,'paperMm':[1022,1600],'marginMm':6,'tickMarginMm':5},True)]:
            with self.subTest(mode=mode,profile=profile):
                m=Manifest(mode,width=1300);m.map_metadata={'metersPerMapUnit':40};m.print_profile=profile
                labels=[]
                for name,limit,required in [('Optional',8,False),('Distance',3,False),('Required',8,True),('Route',8,False),('Visible',64,False)]:
                    labels.append(m.label('<text>'+name+'</text>',name,'l-place',(10,len(labels)*20),source_id=name))
                    m.annotations[-1]['textMaxMetersPerPixel' if name=='Distance' else 'maxMetersPerPixel']=limit
                    if required:m.annotations[-1]['requiredProfiles']=['static-default']
                    if name=='Route':m.annotations[-1]['requiredGroup']='Route'
                features=json.loads(json.dumps(m.data()['features']))
                result=m.finalize('<svg xmlns="http://www.w3.org/2000/svg"><g class="buildings"><path data-source-id="building" data-max-mpp="8" d="M0,0 L1,1"/></g>'+''.join(labels)+'</svg>')
                self.assertEqual(m.data()['features'],features)
                self.assertEqual('data-source-id="building"' not in result,removed)
                names={a['text'] for a in m.annotations}
                self.assertEqual('Optional' not in names,removed)
                self.assertIn('Required',names);self.assertIn('Route',names);self.assertIn('Visible',names)
                if mode=='static':self.assertNotIn('Distance',names)
                else:self.assertIn('Distance',names)
                if removed:self.assertEqual(m.map_metadata['staticPreparation']['removedGeometryElements'],1)
                self.assertIn('data-layout-pending=""',result)

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
    def test_geometry_lookup_does_not_rescan_the_scene_for_each_contour(self):
        count=160;visits=[0];parse=ET.fromstring
        class CountingElement(ET.Element):
            def iter(self, tag=None):
                for element in super().iter(tag):
                    visits[0]+=1
                    yield element
        def counted_parse(text):
            return parse(text,parser=ET.XMLParser(target=ET.TreeBuilder(element_factory=CountingElement)))
        paths=''.join(f'<path id="c{i}" d="M{i},0 L{i+1},80"/>' for i in range(count))
        texts=''.join(f'<text class="l-contour"><textPath href="#c{i}">{i}</textPath></text>' for i in range(count))
        m=Manifest()
        with patch('label_manifest.ET.fromstring',side_effect=counted_parse):
            m.finalize('<svg xmlns="http://www.w3.org/2000/svg"><defs>'+paths+'</defs><g>'+texts+'</g></svg>')
        self.assertEqual(len(m.annotations),count)
        self.assertEqual(m.annotations[-1]['geometryBounds'],[count-1,0,count,80])
        self.assertLess(visits[0],50*count,'Geometry lookup must use a bounded number of scene traversals')
    def test_geometry_lookup_preserves_first_match_and_unknown_path_error(self):
        m=Manifest()
        m.finalize('<svg xmlns="http://www.w3.org/2000/svg"><path id="same" d="M4,9 L14,19"/><path id="same" d="M40,90 L140,190"/><text class="l-contour"><textPath href="#same">1,000</textPath></text></svg>')
        self.assertEqual(m.annotations[0]['anchor'],[4,9])
        self.assertEqual(m.annotations[0]['geometryBounds'],[4,9,14,19])
        with self.assertRaisesRegex(ValueError,'Unknown text path: missing'):
            Manifest().finalize('<svg xmlns="http://www.w3.org/2000/svg"><text><textPath href="#missing">1,000</textPath></text></svg>')
    def test_geometry_lookup_observes_trail_id_changes_before_bounds_lookup(self):
        m=Manifest()
        m.finalize('<svg xmlns="http://www.w3.org/2000/svg"><g class="trails"><path id="old" d="M4,9 L14,19"/></g><text class="l-contour"><textPath href="#old">1,000</textPath></text></svg>')
        self.assertEqual(m.annotations[0]['anchor'],[4,9])
        self.assertNotIn('geometryBounds',m.annotations[0])
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
