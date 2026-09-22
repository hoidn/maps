import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from sources.osm import overpass_query
from map_spec import MapSpec
class QueryTests(unittest.TestCase):
 def test_queries_follow_area_and_classes_without_names(self):
  for name in ['grand_canyon','sequoia']:
   q=overpass_query(MapSpec.load(name));self.assertIn('highway',q);self.assertIn('waterway',q);self.assertIn('building',q);self.assertNotIn('Kaibab',q);self.assertNotIn('["name"]',q);self.assertIn('>>',q)
 def test_all_shop_types_are_requested_without_requiring_other_poi_tags(self):
  query=overpass_query(MapSpec.load('sequoia'))
  self.assertIn('nwr["shop"]',query)
 def test_standalone_fords_are_requested_without_requiring_named_paths(self):
  self.assertIn('nwr["ford"]',overpass_query(MapSpec.load('sequoia')))

class PartitionedFetchTests(unittest.TestCase):
 def spec(self):
  return MapSpec.from_dict({'id':'partitioned','title':'Partitioned','bbox':[0,0,.21,.11],'bufferDegrees':.01})
 def response(self,elements,timestamp='2026-09-22T12:00:00Z'):
  from unittest.mock import Mock
  return Mock(**{'json.return_value':{'version':.6,'osm3s':{'timestamp_osm_base':timestamp},'elements':elements}})
 def test_partitions_cover_the_buffered_frame_without_enlarging_or_gaps(self):
  from sources.osm import query_bounds
  from shapely.geometry import box
  from shapely.ops import unary_union
  bounds=query_bounds(self.spec());self.assertGreater(len(bounds),1)
  tiles=[box(w,s,e,n) for s,w,n,e in bounds];s,w,n,e=self.spec().overpass_bbox
  self.assertTrue(unary_union(tiles).equals(box(w,s,e,n)))
  self.assertAlmostEqual(sum(tile.area for tile in tiles),box(w,s,e,n).area)
  self.assertTrue(all(n-s<=.100001 and e-w<=.100001 for s,w,n,e in bounds))
 def test_fetch_merges_typed_ids_preserves_dependencies_and_records_each_request(self):
  from sources.osm import fetch,query_bounds
  from sources.catalog import verify_source
  from unittest.mock import patch
  import tempfile,json
  nodes=[{'type':'node','id':i,'lat':.02,'lon':.02*i} for i in (1,2)]
  way={'type':'way','id':1,'nodes':[1,2],'tags':{'highway':'path'}}
  relation={'type':'relation','id':1,'members':[{'type':'way','ref':1,'role':''}],'tags':{'type':'route','route':'hiking'}}
  with tempfile.TemporaryDirectory() as tmp,patch('sources.osm.requests.post',return_value=self.response(nodes+[way,relation])) as post:
   path=Path(tmp)/'osm.json';result=fetch(self.spec(),path)
   self.assertEqual(len(result['elements']),4)
   self.assertEqual(post.call_count,len(query_bounds(self.spec())))
   queries=[call.kwargs['data']['data'] for call in post.call_args_list]
   self.assertTrue(all('>>' in query for query in queries))
   self.assertTrue(all('[date:"2026-09-22T12:00:00Z"]' in query for query in queries[1:]))
   self.assertTrue(all('-rel(id:1);' in query for query in queries[1:]))
   self.assertEqual(result['acquisition']['bbox'],list(self.spec().overpass_bbox))
   self.assertEqual(len(result['acquisition']['requests']),post.call_count)
   record=json.loads(path.with_name('osm.json.source.json').read_text());self.assertTrue(verify_source(path,record))
   self.assertEqual(record['datasetVersion'],'2026-09-22T12:00:00Z')
 def test_empty_partition_is_valid_but_failed_or_incomplete_refresh_keeps_prior_cache(self):
  from sources.osm import fetch
  from unittest.mock import patch
  import tempfile,requests,itertools
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'osm.json';path.write_text('prior cache')
   for responses in (
    itertools.chain([self.response([])],itertools.repeat(requests.Timeout('incomplete tile'))),
    itertools.repeat(self.response([{'type':'way','id':1,'nodes':[1234]}])),
   ):
    with self.subTest(responses=responses),patch('sources.osm.requests.post',side_effect=responses):
     with self.assertRaisesRegex((RuntimeError,ValueError),'acquisition|Missing OSM'):fetch(self.spec(),path)
     self.assertEqual(path.read_text(),'prior cache')

 def test_interrupted_fetch_resumes_verified_parts_without_repeating_them(self):
  from sources.osm import fetch,query_bounds
  from unittest.mock import patch
  import tempfile,requests,itertools
  elements=[{'type':'node','id':1,'lat':.02,'lon':.02}]
  with tempfile.TemporaryDirectory() as tmp:
   path=Path(tmp)/'osm.json';path.write_text('prior cache')
   with patch('sources.osm.requests.post',side_effect=itertools.chain([self.response(elements)],itertools.repeat(requests.Timeout('busy')))):
    with self.assertRaises(RuntimeError):fetch(self.spec(),path)
   self.assertEqual(path.read_text(),'prior cache')
   self.assertTrue((Path(tmp)/'osm-parts'/'0000.json').is_file())
   with patch('sources.osm.requests.post',return_value=self.response(elements)) as post:
    result=fetch(self.spec(),path)
    self.assertEqual(post.call_count,len(result['acquisition']['requests'])-1)
    self.assertGreaterEqual(len(result['acquisition']['requests']),len(query_bounds(self.spec())))
   self.assertFalse((Path(tmp)/'osm-parts').exists())

 def test_overloaded_partition_subdivides_without_changing_coverage(self):
  from sources.osm import fetch
  from unittest.mock import patch
  from shapely.geometry import box
  from shapely.ops import unary_union
  import tempfile,requests,re
  spec=MapSpec.from_dict({'id':'dense','title':'Dense','bbox':[0,0,.06,.04],'bufferDegrees':0})
  def server(*args,**kwargs):
   bounds=list(map(float,re.search(r'nwr\["highway"\]\(([^)]+)\)',kwargs['data']['data'])[1].split(',')))
   south,west,north,east=bounds
   if east-west>.04:raise requests.Timeout('dense query')
   return self.response([{'type':'node','id':1,'lat':.01,'lon':.01}])
  with tempfile.TemporaryDirectory() as tmp,patch('sources.osm.requests.post',side_effect=server):
   result=fetch(spec,Path(tmp)/'osm.json')
   tiles=[box(w,s,e,n) for s,w,n,e in (part['bbox'] for part in result['acquisition']['requests'])]
   self.assertEqual(len(tiles),4);self.assertTrue(unary_union(tiles).equals(box(*spec.bbox)))
   self.assertAlmostEqual(sum(tile.area for tile in tiles),box(*spec.bbox).area)

 def test_older_endpoint_snapshot_is_rejected_before_checkpointing(self):
  from sources.osm import fetch,query_bounds
  from unittest.mock import patch
  import tempfile,itertools
  current=self.response([{'type':'node','id':1,'lat':.01,'lon':.01}])
  stale=self.response([{'type':'node','id':2,'lat':.02,'lon':.02}],timestamp='2026-09-21T12:00:00Z')
  with tempfile.TemporaryDirectory() as tmp,patch('sources.osm.requests.post',side_effect=itertools.chain([current,stale],itertools.repeat(current))) as post:
   result=fetch(self.spec(),Path(tmp)/'osm.json')
   self.assertEqual([element['id'] for element in result['elements']],[1])
   self.assertEqual(post.call_count,len(query_bounds(self.spec()))+1)
   self.assertTrue(all(part['serverSnapshot']>='2026-09-22T12:00:00Z' for part in result['acquisition']['requests']))

 def test_rate_limit_retries_after_bounded_delay_on_the_same_endpoint(self):
  from sources.osm import fetch
  from unittest.mock import patch,Mock
  import tempfile,requests
  spec=MapSpec.from_dict({'id':'rate_limited','title':'Rate Limited','bbox':[0,0,.04,.04],'bufferDegrees':0})
  busy=Mock(status_code=429,headers={'Retry-After':'2'})
  busy.raise_for_status.side_effect=requests.HTTPError('rate limited',response=busy)
  good=self.response([{'type':'node','id':1,'lat':.01,'lon':.01}])
  with tempfile.TemporaryDirectory() as tmp,patch('sources.osm.requests.post',side_effect=[busy,good]) as post,patch('time.sleep') as sleep:
   fetch(spec,Path(tmp)/'osm.json')
   sleep.assert_called_once_with(2)
   self.assertEqual(post.call_args_list[0].args[0],post.call_args_list[1].args[0])
