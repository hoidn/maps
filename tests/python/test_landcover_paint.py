import base64,io,json,sys,tempfile,unittest
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'pipeline'))
from map_spec import MapSpec
from cartography.terrain import cover_image

class LandCoverPaintTests(unittest.TestCase):
 def test_theme_palettes_preserve_categories_and_nodata(self):
  spec=MapSpec.from_dict({'id':'anywhere','title':'Anywhere','bbox':[0,0,.1,.1],'width':6,'height':1})
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp);np.save(p/'landcover.npy',np.array([[0,42,52,31,11,95]],dtype=np.uint8))
   (p/'landcover.json').write_text(json.dumps({'frame':spec.frame}))
   arrays=[]
   for theme in ['light','dark']:
    uri=cover_image(spec,[],p,theme=theme);a=np.asarray(Image.open(io.BytesIO(base64.b64decode(uri.split(',')[1]))));arrays.append(a)
    self.assertEqual(a.shape,(1,6,4));self.assertEqual(int(a[0,0,3]),0)
    self.assertTrue(np.all(a[0,1:,3]>0));self.assertEqual(len({tuple(pixel[:3]) for pixel in a[0,1:]}),5)
    forest,barren=a[0,1,:3].astype(int),a[0,3,:3].astype(int)
    self.assertGreater(forest[1],forest[0]);self.assertGreater(barren[0],barren[1])
   np.testing.assert_array_equal(arrays[0][:,:,3],arrays[1][:,:,3])
   self.assertTrue(np.all(arrays[1][0,1:,:3]<arrays[0][0,1:,:3]))

if __name__=='__main__':unittest.main()
