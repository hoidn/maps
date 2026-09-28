import unittest,sys,xml.etree.ElementTree as ET
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from map_spec import MapSpec
from label_manifest import Manifest
from cartography.scene import render_scene,augment_svg
NS={'s':'http://www.w3.org/2000/svg'}
class SceneTests(unittest.TestCase):
 def setUp(self):
  self.spec=MapSpec.from_dict({'id':'test','title':'Test','bbox':[0,0,.1,.1]})
  self.f={'id':'osm:way:1','provider':'osm','kind':'trail','name':'Arbitrary Trail','geometry':{'type':'LineString','coordinates':[[.01,.01],[.03,.04],[.06,.06]]},'tags':{'highway':'path','surface':'ground'},'properties':{},'nodeIds':[1,2,3],'routeIds':[]}
 def test_shared_scene_preserves_source_and_matching_hit_geometry(self):
  m=Manifest();groups,report=render_scene([self.f],[],self.spec,m)
  root=ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg">'+''.join(groups.values())+'</svg>')
  paths=root.findall('.//s:g[@class="trails"]/s:path',NS);hits=root.findall('.//s:g[@class="hits"]/s:path',NS)
  self.assertEqual(paths[0].get('d'),hits[0].get('d'));self.assertEqual(paths[0].get('data-source-id'),'osm:way:1')
  self.assertGreater(len(m.annotations),1);self.assertEqual(report['selected']['trail'],1)
  self.assertTrue(all(a.get('sourceId')=='osm:way:1' for a in m.annotations))
 def test_augmentation_removes_discarded_annotation_records(self):
  m=Manifest();old=m.label('<text x="1" y="1">Old</text>','Old','l-hydro',(1,1))
  svg='<svg xmlns="http://www.w3.org/2000/svg"><defs/><g class="hydro-labels">'+old+'</g><g class="labels"/></svg>'
  out,report=augment_svg(svg,m,self.spec,{'features':[self.f],'routes':[]})
  self.assertNotIn('Old',out);self.assertFalse(any(a['text']=='Old' for a in m.annotations))
 def test_source_identity_survives_manifest_finalization(self):
  m=Manifest();groups,_=render_scene([self.f],[],self.spec,m)
  svg=m.finalize('<svg xmlns="http://www.w3.org/2000/svg">'+''.join(groups.values())+'</svg>')
  root=ET.fromstring(svg);ids={e.get('id') for e in root.iter()}
  self.assertTrue(all(a['geometryId'] in ids for a in m.annotations if a.get('geometryId')))
  self.assertEqual(len({a['featureId'] for a in m.annotations}),1)
 def test_water_polygon_masks_centerline_paint_including_islands(self):
  from copy import deepcopy
  f=deepcopy(self.f);f.update(kind='waterway',name='Water',tags={'waterway':'river'},geometry={'type':'LineString','coordinates':[[0,.05],[.1,.05]]})
  water={'id':'water','kind':'waterbody','name':'Lake','tags':{},'geometry':{'type':'Polygon','coordinates':[[[.02,.02],[.08,.02],[.08,.08],[.02,.08],[.02,.02]],[[.04,.04],[.06,.04],[.06,.06],[.04,.06],[.04,.04]]]}}
  original=deepcopy(f);m=Manifest();groups,_=render_scene([f,water],[],self.spec,m)
  root=ET.fromstring('<svg>'+''.join(groups.values())+'</svg>')
  lines=root.findall('.//path[@class="water-line river"]')
  self.assertEqual(len(lines),2);self.assertEqual(f,original)
  self.assertTrue(m.annotations[0].get('geometryId'));self.assertTrue(next(a for a in m.annotations if a['text']=='Lake').get('areaPolygons'))
 def test_semantic_labels_and_bridge_case_ownership(self):
  from copy import deepcopy
  f=deepcopy(self.f);f['tags']['bridge']='yes';m=Manifest();groups,_=render_scene([f],[],self.spec,m)
  root=ET.fromstring(m.finalize('<svg xmlns="http://www.w3.org/2000/svg">'+''.join(groups.values())+'</svg>'))
  case=root.find('.//s:path[@class="bridge-case"]',NS);core=root.find('.//s:path[@class="tr transport trail"]',NS)
  self.assertEqual(case.get('data-layout-obstacle'),'trail');self.assertNotEqual(case.get('id'),core.get('id'));self.assertEqual(case.get('d'),core.get('d'))
 def test_generated_area_and_peak_labels_have_semantic_parent_layers(self):
  polygon={'type':'Polygon','coordinates':[[[.01,.01],[.09,.01],[.09,.09],[.01,.09],[.01,.01]]]}
  features=[{'id':'b','kind':'boundary','geometry':polygon,'name':'Park','tags':{}},{'id':'w','kind':'waterbody','geometry':polygon,'name':'Lake','tags':{}},{'id':'p','kind':'poi','geometry':{'type':'Point','coordinates':[.05,.05]},'name':'Summit','tags':{'natural':'peak'}}]
  m=Manifest();groups,_=render_scene(features,[],self.spec,m)
  for text,group,layer in [('Park','boundary-labels','boundaries'),('Lake','hydro-labels','water'),('Summit','peaks','peaks')]:
   a=next(a for a in m.annotations if a['text']==text);self.assertEqual(a['layer'],layer);self.assertIn(a['id'],groups[group])
  peak=next(a for a in m.annotations if a['kind']=='symbol');self.assertIn(peak['id'],groups['peaks'])
 def test_transport_tooltip_preserves_attributes_and_component_geodesic_lengths(self):
  from copy import deepcopy
  from pyproj import Geod
  f=deepcopy(self.f);f['geometry']={'type':'MultiLineString','coordinates':[[[.01,.01],[.02,.01]],[[.03,.03],[.06,.03]]]};f['tags'].update(sac_scale='mountain_hiking',trail_visibility='intermediate',foot='private',ref='R1');m=Manifest();groups,_=render_scene([f],[],self.spec,m)
  root=ET.fromstring(groups['trails']);paths=root.findall('./path[@class="tr transport trail"]')
  for path,coords in zip(paths,f['geometry']['coordinates']):
   self.assertAlmostEqual(float(path.get('data-mi')),Geod(ellps='WGS84').line_length(*zip(*coords))/1609.344,places=4)
   info=path.get('data-info','');self.assertIn('ground',info);self.assertIn('mountain_hiking',info);self.assertIn('intermediate',info);self.assertIn('private',info);self.assertIn('R1',info)
  self.assertTrue(any(a.get('text')=='Arbitrary Trail' for a in m.annotations))
  self.assertFalse(any(a.get('style')=='l-road-ref' for a in m.annotations))
 def test_fully_covered_water_line_never_emits_empty_svg_path(self):
  from copy import deepcopy
  f=deepcopy(self.f);f.update(kind='waterway',tags={'waterway':'river'})
  water={'id':'water','kind':'waterbody','name':'Lake','tags':{},'geometry':{'type':'Polygon','coordinates':[[[0,0],[.1,0],[.1,.1],[0,.1],[0,0]]]}}
  groups,_=render_scene([f,water],[],self.spec,Manifest())
  self.assertNotIn('d="M"',groups['hydro'])
 def test_unnamed_facility_uses_symbol_without_a_sentence_label(self):
  f={'id':'s','kind':'poi','name':None,'geometry':{'type':'Point','coordinates':[.05,.05]},'tags':{'natural':'spring'}};m=Manifest();render_scene([f],[],self.spec,m)
  self.assertEqual([a['kind'] for a in m.annotations],['symbol'])
 def test_renaming_and_geographic_translation_do_not_change_style_or_selection(self):
  from copy import deepcopy
  a=deepcopy(self.f);a['name']='Bright Angel Trail'
  b=deepcopy(self.f);b['name']='Arbitrary Sierra Path';b['geometry']['coordinates']=[[x+10,y+7] for x,y in b['geometry']['coordinates']]
  shifted=MapSpec.from_dict({'id':'translated','title':'Translated','bbox':[10,7,10.1,7.1]})
  _,first=render_scene([a],[],self.spec,Manifest());_,second=render_scene([b],[],shifted,Manifest())
  self.assertEqual(first['selected'],second['selected']);self.assertEqual(first['styles'],second['styles']);self.assertEqual(first['omitted'],second['omitted'])
 def test_railway_uses_shared_line_geometry_screen_constant_ties_and_source_labels(self):
  from copy import deepcopy
  f=deepcopy(self.f);f.update(kind='railway',name='Arbitrary Railway',tags={'railway':'rail','usage':'tourism','gauge':'1435'})
  original=deepcopy(f);m=Manifest();groups,report=render_scene([f],[],self.spec,m)
  root=ET.fromstring(groups['roads']);core=root.find('./path[@class="railway-core"]');ties=root.find('./path[@class="railway-ties"]')
  self.assertIsNotNone(core);self.assertIsNotNone(ties);self.assertEqual(core.get('d'),ties.get('d'))
  for path in (core,ties):
   self.assertEqual(path.get('data-source-id'),f['id']);self.assertEqual(path.get('data-status'),'unknown');self.assertIn('var(--s)',path.get('style'));self.assertIn('usage: tourism',path.get('data-info'));self.assertIn('electrified: unknown',path.get('data-info'))
  self.assertIn('stroke-dasharray:calc(1px * var(--s)),calc(6px * var(--s))',ties.get('style'))
  self.assertEqual(report['selected']['railway'],1);self.assertEqual(report['omitted'],[]);self.assertEqual(f,original)
  self.assertTrue(m.annotations);self.assertTrue(all(a['style']=='l-road' and a['sourceId']==f['id'] for a in m.annotations))
 def test_railway_lifecycle_is_explicit_without_inventing_current_operation(self):
  from copy import deepcopy
  for tags,status in [({'railway':'disused'},'disused'),({'railway':'rail','abandoned':'yes'},'abandoned'),({'railway':'rail','construction:railway':'rail'},'construction'),({'railway':'rail'},'unknown')]:
   with self.subTest(tags=tags):
    f=deepcopy(self.f);f.update(kind='railway',name=None,tags=tags);groups,report=render_scene([f],[],self.spec,Manifest())
    core=ET.fromstring(groups['roads']).find('./path[@class="railway-core"]')
    self.assertIsNotNone(core);self.assertEqual(core.get('data-status'),status);self.assertEqual(report['selected']['railway'],1)
    if status!='unknown':self.assertIn('opacity:.5',core.get('style'))

 def test_static_scene_has_no_interactive_hit_paths(self):
  groups,report=render_scene([self.f],[],self.spec,Manifest(mode='static'))
  root=ET.fromstring('<svg>'+''.join(groups.values())+'</svg>')
  self.assertEqual(root.findall('.//path[@class="hit"]'),[])
  self.assertTrue(root.findall('.//path[@class="tr transport trail"]'))
  self.assertEqual(report['selected']['trail'],1)
 def test_primary_point_labels_are_navigation_destinations_not_every_amenity(self):
  cases=[('trailhead',{'highway':'trailhead'},True),('camp',{'tourism':'camp_site'},True),('hut',{'tourism':'wilderness_hut'},True),('settlement',{'place':'village'},True),('visitor',{'tourism':'information','information':'visitor_centre'},True),('ranger',{'amenity':'ranger_station'},True),('view',{'tourism':'viewpoint'},False),('spring',{'natural':'spring'},False),('hotel',{'tourism':'hotel'},False),('toilets',{'amenity':'toilets'},False),('shop',{'shop':'convenience'},False),('unclassified',{},False)]
  features=[{'id':key,'kind':'poi','name':'Arbitrary '+key,'geometry':{'type':'Point','coordinates':[.03,.04]},'tags':tags} for key,tags,_ in cases]
  m=Manifest();groups,report=render_scene(features,[],self.spec,m)
  by={a['sourceId']:a for a in m.annotations if a['kind']=='point-label'}
  for key,tags,primary in cases:
   with self.subTest(key=key):
    if key=='toilets':
     self.assertNotIn(key,by);self.assertTrue(next(f for f in m.features.values() if f['sourceId']==key)['directory']);continue
    self.assertEqual(by[key]['priority']>=800,primary);self.assertEqual(by[key]['importanceClass'],'primary' if primary else 'secondary');self.assertTrue(by[key]['priorityReason'])
  self.assertEqual(report['selected']['poi'],len(cases));self.assertEqual([(o['id'],o['reason']) for o in report['omitted']],[('toilets','symbol-only-service-label')])
 def test_poi_priority_is_stable_under_renaming_and_translation(self):
  from copy import deepcopy
  f={'id':'p','kind':'poi','name':'First name','geometry':{'type':'Point','coordinates':[.03,.04]},'tags':{'tourism':'viewpoint'}}
  a=Manifest();render_scene([f],[],self.spec,a)
  moved=deepcopy(f);moved['name']='Different name';moved['geometry']['coordinates']=[.06,.07];b=Manifest();render_scene([moved],[],self.spec,b)
  for first,second in zip(a.annotations,b.annotations):
   self.assertEqual(first['priority'],second['priority']);self.assertEqual(first['priorityReason'],second['priorityReason'])
 def test_summit_symbols_win_optional_collisions_across_sources_and_modes(self):
  import json,subprocess
  from copy import deepcopy
  cases=[]
  for mode in ('interactive','static'):
   for source in ('osm','gnis','legacy'):
    for name,xy in [('Arbitrary Summit',[.03,.04]),('Renamed Summit',[.06,.07])]:
     def feature(identity,title,tags,properties=None):
      return {'id':identity,'kind':'poi','name':title,'geometry':{'type':'Point','coordinates':xy},'tags':tags,'properties':properties or {}}
     features=[feature('water',None,{'amenity':'drinking_water'}),feature('settlement','Arbitrary Village',{'place':'village'})]
     m=Manifest(mode);m.required=set()
     if source=='legacy':
      m.symbol('<path/>','peak',self.spec.project(xy[1],xy[0]),source_id='summit')
      self.assertEqual(m.annotations[-1]['priority'],860)  # No regional enrichment on the legacy path.
     else:features.append(feature('summit',name,{'natural':'peak'} if source=='osm' else {},{'featureClass':'Summit'} if source=='gnis' else {}))
     original=deepcopy(features);render_scene(features,[],self.spec,m);self.assertEqual(features,original)
     summit=next(a for a in m.annotations if a.get('symbolKind')=='peak')
     names=[a for a in m.annotations if a.get('style')=='l-peak']
     for a in names:self.assertEqual((a['priority'],a['textMaxMetersPerPixel']),(620,12))
     cases.append({'name':(mode,source,name),'summit':summit['id'],'annotations':[a for a in m.annotations if a['kind']=='symbol' or a.get('style')=='l-settlement']})
  script="""
import assert from 'node:assert/strict';
import {solveLayout} from './pipeline/labels/place.js';
let input='';for await(const chunk of process.stdin)input+=chunk;
for(const c of JSON.parse(input)){
 const annotations=c.annotations.map(a=>{const [x,y]=a.anchor,b={x:x-5,y:y-5,width:10,height:10};return {...a,candidates:[{id:'anchored',shape:{bounds:b,parts:[b]}}]};});
 const result=solveLayout({annotations,viewport:{width:1600,height:1600},policy:{clearance:2,repairMaxNeighbors:0}});
 assert.deepEqual(result.placements.map(p=>p.id),[c.summit],c.name.join(':'));
 assert.deepEqual(result.missingRequired,[]);
}
"""
  run=subprocess.run(['node','--input-type=module','-e',script],input=json.dumps(cases),text=True,capture_output=True,cwd=Path(__file__).resolve().parents[2])
  self.assertEqual(run.returncode,0,run.stderr)
 def test_railway_legend_contains_line_and_ties_only_when_present(self):
  from cartography.integration import transport_legend
  context={'spec':self.spec,'report':{'styles':[],'selected':{'railway':1}}}
  legend=transport_legend(context);self.assertIn('data-symbol="railway"',legend);self.assertIn('stroke-dasharray="1,6"',legend);self.assertIn('Railway',legend)
  context['report']['selected']={};self.assertNotIn('data-symbol="railway"',transport_legend(context))
 def test_road_directory_uses_true_geometry_anchor_and_name_not_ref(self):
  from copy import deepcopy
  from shapely.geometry import LineString
  f=deepcopy(self.f);f.update(kind='road',name='Arbitrary Road',tags={'highway':'primary','ref':'R 17'})
  original=deepcopy(f);m=Manifest();render_scene([f],[],self.spec,m)
  feature=next(f for f in m.features.values() if f['sourceId']==original['id'])
  expected=LineString([self.spec.project(lat,lon) for lon,lat in original['geometry']['coordinates']]).interpolate(.5,normalized=True)
  self.assertEqual(feature['name'],'Arbitrary Road');self.assertTrue(feature['directory'])
  self.assertEqual(feature['anchor'],[round(expected.x,1),round(expected.y,1)])
  self.assertEqual(f,original);self.assertTrue(any(a['text']=='R 17' for a in m.annotations))
 def test_unnamed_road_with_ref_keeps_searchable_reference_at_its_geometry(self):
  from copy import deepcopy
  f=deepcopy(self.f);f.update(kind='road',name=None,tags={'highway':'primary','ref':'R 17'})
  m=Manifest();render_scene([f],[],self.spec,m)
  feature=next(iter(m.features.values()));self.assertEqual(feature['name'],'R 17');self.assertTrue(feature['directory']);self.assertNotEqual(feature['anchor'],[0,0])

 def test_transport_paint_and_hit_share_source_route_membership(self):
  from copy import deepcopy
  import json
  f=deepcopy(self.f);f['routeIds']=['osm:relation:9','osm:relation:7'];m=Manifest();groups,_=render_scene([f],[],self.spec,m)
  for group in ('trails','hits'):
   for path in ET.fromstring(groups[group]).findall('./path'):
    self.assertEqual(path.get('data-source-id'),f['id']);self.assertEqual(json.loads(path.get('data-route-ids','[]')),sorted(f['routeIds']))
 def test_area_facility_preserves_footprint_and_anchors_poi_inside_it(self):
  from copy import deepcopy
  from shapely.geometry import shape,Point
  geometry={'type':'Polygon','coordinates':[[[.01,.01],[.09,.01],[.09,.09],[.01,.09],[.01,.01]],[[.03,.03],[.03,.07],[.07,.07],[.07,.03],[.03,.03]]]}
  f={'id':'osm:way:area','sourceId':'osm:way:area','provider':'osm','kind':'building','name':'Visitor Centre','geometry':geometry,'tags':{'building':'yes','tourism':'information','information':'visitor_centre'}}
  original=deepcopy(f);m=Manifest();groups,report=render_scene([f],[],self.spec,m)
  self.assertIn('area-building',groups['buildings']);self.assertIn('facility-mark',groups['symbols']);self.assertTrue(any(a['text']=='Visitor Centre' for a in m.annotations))
  self.assertEqual(report['selected']['building'],1);self.assertEqual(report['selected']['poi'],1);self.assertEqual(f,original)
  for a in m.annotations:
   self.assertEqual(a['sourceId'],f['id']);lat,lon=self.spec.unproject(*a['anchor']);self.assertTrue(shape(geometry).covers(Point(lon,lat)))
  directory=[x for x in m.features.values() if x['directory']];self.assertEqual(len(directory),1);self.assertEqual(directory[0]['name'],'Visitor Centre');self.assertEqual(directory[0]['sourceId'],f['id'])
 def test_unnamed_toilet_building_gets_symbol_without_invented_name(self):
  f={'id':'osm:way:toilets','kind':'building','name':None,'geometry':{'type':'Polygon','coordinates':[[[.01,.01],[.02,.01],[.02,.02],[.01,.02],[.01,.01]]]},'tags':{'building':'yes','amenity':'toilets'}}
  m=Manifest();groups,report=render_scene([f],[],self.spec,m)
  self.assertEqual([a['kind'] for a in m.annotations],['symbol']);self.assertEqual(m.annotations[0]['symbolKind'],'toilets');self.assertIn('area-building',groups['buildings']);self.assertFalse(any(f['directory'] for f in m.features.values()))
 def test_unclassified_unnamed_building_facility_omits_only_the_poi_role(self):
  f={'id':'osm:way:unknown','kind':'building','name':None,'geometry':{'type':'Polygon','coordinates':[[[.01,.01],[.02,.01],[.02,.02],[.01,.02],[.01,.01]]]},'tags':{'building':'yes','amenity':'unclassified'}}
  groups,report=render_scene([f],[],self.spec,Manifest())
  self.assertIn('area-building',groups['buildings']);self.assertEqual(report['selected']['building'],1)
  self.assertEqual(report['omitted'][0]['role'],'poi');self.assertEqual(report['omitted'][0]['reason'],'unclassified-unnamed-point')

 def test_authored_point_priorities_follow_shared_symbol_semantics(self):
  m=Manifest();m.required=set();raw=[]
  for i,(symbol,expected) in enumerate([('th',830),('camp',820),('view',650),('wp',550),('water',730),('shelter',690),('lodge',690)]):
   xy=(10+i*20,30);name='Arbitrary '+str(i)
   raw.append(m.symbol('<circle r="2"/>',symbol,xy));raw.append(m.label('<text>'+name+'</text>',name,'l-place',xy))
  render_scene([],[],self.spec,m)
  labels=[a for a in m.annotations if a['kind']=='point-label']
  self.assertEqual([a['priority'] for a in labels],[830,820,650,550,730,690,690])
  self.assertTrue(all(a.get('priorityReason') for a in labels))
  self.assertTrue(all('maxMetersPerPixel' not in a for a in labels))
 def test_authored_major_and_explicit_required_priority_survive_semantic_classification(self):
  for mode in ('interactive','static'):
   m=Manifest(mode);m.required={'Required Alpha'}
   for name,cls,xy in [('Required Alpha','l-place',(10,10)),('Required Alpha','l-place',(20,20)),('Major Beta','l-major',(30,30)),('Configured Gamma','l-place',(40,40))]:
    m.symbol('<circle r="2"/>','view',xy);m.label('<text>'+name+'</text>',name,cls,xy)
   spec=MapSpec.from_dict({'id':'arbitrary','title':'Arbitrary','bbox':[0,0,.1,.1],'requiredNames':['Required Alpha','Configured Gamma']})
   render_scene([],[],spec,m)
   labels=[a for a in m.annotations if a['kind']=='point-label']
   self.assertEqual([a['priority'] for a in labels],[1000,650,900,1000])
   self.assertEqual([a['text'] for a in labels if a.get('priorityReason')=='required-destination'],['Required Alpha','Configured Gamma'])
   self.assertEqual(labels[0]['requiredProfiles'],['static-default']);self.assertEqual(labels[1]['requiredProfiles'],[])
 def test_settlement_detail_limit_includes_overview_without_promoting_ordinary_points(self):
  for tags,properties in [({'place':'village'},{}),({}, {'featureClass':'Populated Place'})]:
   m=Manifest();f={'id':'p','kind':'poi','name':'Arbitrary Settlement','geometry':{'type':'Point','coordinates':[.03,.04]},'tags':tags,'properties':properties}
   render_scene([f],[],self.spec,m)
   label=next(a for a in m.annotations if a['kind']=='point-label')
   self.assertEqual(label['maxMetersPerPixel'],64);self.assertEqual(label['priority'],850)

 def test_supplies_symbols_cover_food_shops_without_inventing_other_shop_roles(self):
  from cartography.poi import poi_style
  for shop in ('convenience','supermarket'):
   self.assertEqual(poi_style({'shop':shop})['symbol'],'shop')
  self.assertEqual(poi_style({'shop':'gift'})['symbol'],'point')
 def test_every_declared_facility_has_a_distinct_implemented_glyph(self):
  from cartography.poi import RULES
  from cartography.symbols import PATHS,symbol_svg
  for _,_,symbol,_ in RULES:
   self.assertIn(symbol,PATHS)
   if symbol!='point':self.assertNotEqual(symbol_svg(symbol),symbol_svg('point'))
 def test_unnamed_gate_picnic_phone_ford_and_crossing_render_without_invented_names(self):
  tags=[{'barrier':'gate'},{'tourism':'picnic_site'},{'amenity':'telephone'},{'ford':'yes'},{'highway':'crossing'}]
  fs=[{'id':'osm:node:'+str(i),'kind':'poi','name':None,'geometry':{'type':'Point','coordinates':[.02+i*.01,.04]},'tags':t} for i,t in enumerate(tags)]
  m=Manifest();groups,report=render_scene(fs,[],self.spec,m)
  self.assertEqual(len(m.annotations),5);self.assertTrue(all(a['kind']=='symbol' for a in m.annotations));self.assertEqual(report['omitted'],[])
  self.assertEqual({a['symbolKind'] for a in m.annotations},{'gate','picnic','telephone','ford','crossing'})
  self.assertTrue(all(a['maxMetersPerPixel']<=12 for a in m.annotations))
 def test_source_peak_elevation_is_attached_with_units_and_provenance(self):
  f={'id':'osm:node:peak','provider':'osm','kind':'poi','name':'Arbitrary Summit','geometry':{'type':'Point','coordinates':[.03,.04]},'tags':{'natural':'peak','ele':'3000'}}
  m=Manifest();groups,_=render_scene([f],[],self.spec,m);a=next(a for a in m.annotations if a['kind']=='point-label')
  self.assertEqual(a['text'],'Arbitrary Summit');self.assertEqual(a['elevation']['valueMeters'],3000);self.assertEqual(a['elevation']['sourceId'],f['id']);self.assertEqual(a['elevation']['method'],'source-tag:ele');self.assertEqual(a['elevation']['verticalDatum'],'unknown')
  self.assertIn('9,843 ft',groups['peaks']);self.assertIn('class="l-sub"',groups['peaks']);self.assertEqual(m.features[a['featureId']]['name'],f['name'])
  for value in ('unknown','3000 ft','NaN','inf',''):
   f['tags']['ele']=value;m=Manifest();groups,_=render_scene([f],[],self.spec,m);a=next(a for a in m.annotations if a['kind']=='point-label');self.assertNotIn('elevation',a);self.assertNotIn('class="l-sub"',groups['peaks'])
 def test_linear_barrier_keeps_line_geometry_and_unnamed_paint(self):
  from copy import deepcopy
  f=deepcopy(self.f);f.update(kind='barrier',name=None,tags={'barrier':'fence'})
  m=Manifest();groups,report=render_scene([f],[],self.spec,m)
  root=ET.fromstring(groups['roads']);path=root.find('./path[@class="barrier-line"]')
  self.assertIsNotNone(path);self.assertEqual(path.get('data-source-id'),f['id']);self.assertIn('var(--s)',path.get('style'));self.assertEqual(report['selected']['barrier'],1)
 def test_junction_distance_label_is_single_scale_gated_and_source_bound(self):
  from copy import deepcopy
  from cartography.route_graph import junction_segments
  f=deepcopy(self.f);f['geometry']['coordinates']=[[.01,.04],[.04,.04],[.07,.04]];segments=junction_segments([f]);original=deepcopy(segments)
  m=Manifest();groups,report=render_scene([f],[],self.spec,m,distances=segments)
  annotations=[a for a in m.annotations if a.get('distanceSegmentId')]
  self.assertEqual(len(annotations),1);a=annotations[0]
  self.assertEqual(a['sourceId'],f['id']);self.assertEqual(a['distanceSegmentId'],segments[0]['id']);self.assertEqual(a['distanceMeters'],segments[0]['meters']);self.assertEqual(a['distanceMethod'],segments[0]['method']);self.assertEqual(a['repeatGroup'],segments[0]['id']);self.assertLessEqual(a['maxMetersPerPixel'],6);self.assertLess(a['priority'],650)
  self.assertIn(' mi / ',a['text']);self.assertIn(' km',a['text']);self.assertEqual(segments,original)
  self.assertEqual(m.features[a['featureId']]['name'],f['name']);self.assertEqual(m.features[a['featureId']]['kind'],'trail')

 def test_distance_geometry_too_short_at_maximum_scale_stays_in_table_input_only(self):
  from copy import deepcopy
  from cartography.route_graph import junction_segments
  f=deepcopy(self.f);f['geometry']['coordinates']=[[.04,.04],[.040001,.04],[.040002,.04]];segments=junction_segments([f]);original=deepcopy(segments)
  m=Manifest();groups,report=render_scene([f],[],self.spec,m,distances=segments)
  self.assertFalse(any(a.get('distanceSegmentId') for a in m.annotations));self.assertEqual(report['distanceLabels']['generated'],0)
  self.assertEqual(report['distanceLabels']['omitted'][0]['reason'],'distance-window-too-short-at-supported-scale');self.assertEqual(segments,original)
 def test_new_facility_symbols_are_explained_in_generated_legend(self):
  from cartography.integration import transport_legend
  context={'spec':self.spec,'report':{'styles':[],'selected':{'barrier':1},'facilitySymbols':{'gate':2,'ford':1,'shop':1,'picnic':1,'telephone':1}}}
  legend=transport_legend(context)
  for text in ('Gate','Ford','Supplies','Picnic','Telephone','Fence / wall'):
   self.assertIn(text,legend)
  self.assertIn('access and availability unverified',legend)
