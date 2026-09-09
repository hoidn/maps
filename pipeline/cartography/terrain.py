"""Neutral relief with independent categorical land-cover color, portable to any AOI."""
import base64,io,json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
from scipy.ndimage import gaussian_filter
from skimage.measure import find_contours
from hillshade import multidirectional
from path_geometry import detail_path
from .scene import map_geometry,parts

COVER={11:'#a9cbd6',12:'#edf0f1',21:'#d9d0c4',22:'#cfc3b6',23:'#c2b2a4',24:'#b09c90',31:'#e1cbaa',41:'#bad09d',42:'#9fbd94',43:'#acc69a',52:'#d4ceaa',71:'#dedaaa',81:'#d0d1a0',82:'#d8c89c',90:'#a6c9b2',95:'#bfd4ad'}
COVER_DARK={11:'#304d59',12:'#697575',21:'#514b43',22:'#5a4f43',23:'#655344',24:'#705647',31:'#716048',41:'#49603c',42:'#375133',43:'#405a37',52:'#625f40',71:'#696747',81:'#586044',82:'#6a5e3c',90:'#345b49',95:'#4a6547'}
COVER_KEY=((42,'Forest'),(52,'Shrub / scrub'),(71,'Grassland'),(31,'Barren rock / sand'),(22,'Developed'),(90,'Wetland'),(12,'Ice / snow'))
def uri(rgb,fmt='PNG'):
 b=io.BytesIO();Image.fromarray(np.asarray(rgb,dtype=np.uint8)).save(b,format=fmt,optimize=True)
 return 'data:image/'+fmt.lower()+';base64,'+base64.b64encode(b.getvalue()).decode()
def neutral_relief(dem,spec):
 h,w=dem.shape;dx=spec.meters_per_map_unit*spec.width/w;dy=spec._forward.transform(spec.center[1],spec.bbox[3])[1]*2/h
 gy,gx=np.gradient(gaussian_filter(dem,1),dy,dx);shade=multidirectional(gx,gy)
 shade=np.clip(.78+.27*shade,0,1)
 return {'uri_light':uri(np.stack([shade*238,shade*234,shade*222],axis=-1),'JPEG'),'uri_dark':uri(np.stack([shade*60,shade*66,shade*63],axis=-1),'JPEG')}
def cover_image(spec,features,root,*,theme='light'):
 if theme not in ('light','dark'):raise ValueError('Unknown land-cover theme')
 palette=COVER_DARK if theme=='dark' else COVER
 p=Path(root)/'landcover.npy';w,h=spec.width,spec.height
 if p.exists():
  meta=json.loads(p.with_suffix('.json').read_text());spec.validate_cache(meta)
  arr=np.load(p);arr=np.asarray(Image.fromarray(arr.astype('uint8')).resize((w,h),Image.Resampling.NEAREST))
  rgb=np.zeros((h,w,4),dtype=np.uint8)
  for key,color in palette.items():
   c=tuple(bytes.fromhex(color[1:]));rgb[arr==key]=(*c,190)
  return uri(rgb)
 # OSM is a labeled fallback, not a claim to complete vegetation coverage.
 image=Image.new('RGBA',(w,h),(0,0,0,0));draw=ImageDraw.Draw(image)
 classes={'wood':42,'forest':42,'grassland':71,'grass':71,'meadow':71,'scrub':52,'wetland':90,'glacier':12,'bare_rock':31,'sand':31}
 for f in features:
  if f['kind']!='landcover':continue
  t=f.get('tags',{});category=classes.get(t.get('natural'),classes.get(t.get('landuse')))
  if category is None:continue
  color=palette[category]
  for poly in parts(map_geometry(f,spec),'Polygon'):
   draw.polygon(list(poly.exterior.coords),fill=(*bytes.fromhex(color[1:]),190))
   for ring in poly.interiors:draw.polygon(list(ring.coords),fill=(0,0,0,0))
 return uri(np.asarray(image))
def contours(dem,spec):
 ft=gaussian_filter(dem,1)*3.28084;h,w=ft.shape;out={'index':[],'inter':[],'fine':[],'finest':[]}
 coarse,medium,fine=spec.contour_intervals
 for level in range(int(np.nanmin(ft)//fine)*fine,int(np.nanmax(ft))+fine,fine):
  group='index' if level%(coarse*4)==0 else 'inter' if level%coarse==0 else 'fine' if level%medium==0 else 'finest'
  paths=[]
  for line in find_contours(ft,level):
   if len(line)<5:continue
   points=[((float(c)+.5)/w*spec.width,(float(r)+.5)/h*spec.height) for r,c in line]
   paths.append(detail_path(points,.08))
  if paths:out[group].append({'lv':level,'d':paths})
 return out
