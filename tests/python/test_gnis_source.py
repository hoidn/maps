import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from sources import gnis
class GNISTests(unittest.TestCase):
 def test_county_join_duplicates_do_not_duplicate_named_features(self):
  features=[{'attributes':{'OBJECTID':i,'gaz_id':42,'gaz_name':'River','gaz_featureclass':'Stream'},'geometry':{'points':[[-112,36],[-111,37]]}} for i in [1,2]]
  result=gnis.normalize([(6,{'features':features})])
  self.assertEqual(len(result),1);self.assertEqual(result[0]['properties']['sourceObjectIds'],[1,2]);self.assertEqual(len(result[0]['geometry']['coordinates']),2)
 def test_distinct_points_for_same_identifier_are_preserved(self):
  features=[{'attributes':{'OBJECTID':i,'gaz_id':42,'gaz_name':'River','gaz_featureclass':'Stream'},'geometry':{'points':[p]}} for i,p in [(1,[-112,36]),(2,[-111,37])]]
  result=gnis.normalize([(6,{'features':features})]);self.assertEqual(result[0]['geometry']['type'],'MultiPoint');self.assertEqual(len(result[0]['geometry']['coordinates']),2)
