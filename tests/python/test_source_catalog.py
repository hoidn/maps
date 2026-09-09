import unittest,sys,tempfile,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from sources.catalog import record_source,verify_source
class SourceTests(unittest.TestCase):
 def test_original_bytes_and_source_freshness_are_distinct(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'data.json';p.write_text('{"features":[]}')
   r=record_source(p,provider='test',url='https://example.org/data',retrieved_at=None,dataset_version='unknown',bbox=[0,0,1,1])
   self.assertIsNone(r['retrievedAt']);self.assertTrue(verify_source(p,r));p.write_text('{}');self.assertFalse(verify_source(p,r))
