import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from water_areas import WaterAreas

def data():
    points={1:(0,0),2:(10,0),3:(10,10),4:(0,10),5:(4,4),6:(6,4),7:(6,6),8:(4,6)}
    return [dict(type='node',id=i,lat=y,lon=x) for i,(x,y) in points.items()]+[
        dict(type='way',id=11,nodes=[1,2,3]),dict(type='way',id=12,nodes=[1,4,3]),
        dict(type='way',id=13,nodes=[5,6,7,8,5]),
        dict(type='relation',id=20,tags={'natural':'water','water':'river','type':'multipolygon'},members=[dict(type='way',ref=i,role=role) for i,role in [(12,'outer'),(11,'outer'),(13,'inner')]])]
class WaterAreaTests(unittest.TestCase):
    def test_fragmented_reversed_banks_preserve_islands(self):
        w=WaterAreas(data(),lambda lat,lon:(lon,lat),(-2,-2,12,12))
        self.assertAlmostEqual(w.geometry.area,96)
        self.assertEqual(len(w.paths()),1)
        self.assertEqual(w.paths()[0].count('Z'),2)
        runs=w.uncovered_runs([(-1,5),(11,5)])
        self.assertAlmostEqual(sum(abs(r[-1][0]-r[0][0]) for r in runs),2)
    def test_relation_without_islands(self):
        els=data()
        els[-1]['members']=els[-1]['members'][:2]
        self.assertEqual(WaterAreas(els,lambda lat,lon:(lon,lat),(0,0,10,10)).geometry.area,100)
    def test_closed_way_is_clipped_to_frame(self):
        els=data()[:8]+[dict(type='way',id=30,nodes=[1,2,3,4,1],tags={'waterway':'riverbank'})]
        self.assertEqual(WaterAreas(els,lambda lat,lon:(lon,lat),(0,0,5,5)).geometry.area,25)
    def test_missing_member_is_not_closed_across_unknown_banks(self):
        els=[e for e in data() if e['id']!=12]
        with self.assertRaises(ValueError):WaterAreas(els,lambda lat,lon:(lon,lat),(-2,-2,12,12))
    def test_no_area_retains_complete_centerline(self):
        w=WaterAreas([],lambda lat,lon:(lon,lat),(0,0,10,10))
        self.assertEqual(w.paths(),[])
        self.assertEqual(w.uncovered_runs([(1,1),(9,9)]),[[(1.,1.),(9.,9.)]])
