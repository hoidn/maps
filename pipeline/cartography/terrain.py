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

COVER={11:'#bfd5dc',12:'#eeeef0',21:'#ded9c9',22:'#dad4c6',23:'#d3ccbd',24:'#c4baaa',31:'#e7dfce',41:'#d7e1c5',42:'#c8d8bc',43:'#d0dec2',52:'#dce2ca',71:'#e6e5cd',81:'#e0e3c9',82:'#e3dfc4',90:'#c8ded0',95:'#d6e3d2'}
def uri(rgb,fmt='PNG'):
 b=io.BytesIO();Image.fromarray(np.asarray(rgb,dtype=np.uint8)).save(b,format=fmt,optimize=True)
 return 'data:image/'+fmt.lower()+';base64,'+base64.b64encode(b.getvalue()).decode()
def neutral_relief(dem,spec):
 h,w=dem.shape;dx=spec.meters_per_map_unit*spec.width/w;dy=spec._forward.transform(spec.center[1],spec.bbox[3])[1]*2/h
 gy,gx=np.gradient(gaussian_filter(dem,1),dy,dx);shade=multidirectional(gx,gy)
 shade=np.clip(.78+.27*shade,0,1)
 return {'uri_light':uri(np.stack([shade*238,shade*234,shade*222],axis=-1),'JPEG'),'uri_dark':uri(np.stack([shade*60,shade*66,shade*63],axis=-1),'JPEG')}
def cover_image(spec,features,root):
 p=Path(root)/'landcover.npy';w,h=spec.width,spec.height
 if p.exists():
  meta=json.loads(p.with_suffix('.json').read_text());spec.validate_cache(meta)
  arr=np.load(p);arr=np.asarray(Image.fromarray(arr.astype('uint8')).resize((w,h),Image.Resampling.NEAREST))
  rgb=np.zeros((h,w,4),dtype=np.uint8)
  for key,color in COVER.items():
   c=tuple(bytes.fromhex(color[1:]));rgb[arr==key]=(*c,145)
  return uri(rgb)
 # OSM is a labeled fallback, not a claim to complete vegetation coverage.
 image=Image.new('RGBA',(w,h),(0,0,0,0));draw=ImageDraw.Draw(image)
 colors={'wood':'#c8d8bc','forest':'#c8d8bc','grassland':'#e6e5cd','meadow':'#e6e5cd','scrub':'#dce2ca','wetland':'#c8ded0','glacier':'#eeeef0','bare_rock':'#e7dfce','sand':'#e7dfce'}
 for f in features:
  if f['kind']!='landcover':continue
  t=f.get('tags',{});color=colors.get(t.get('natural'),colors.get(t.get('landuse')))
  if not color:continue
  for poly in parts(map_geometry(f,spec),'Polygon'):
   draw.polygon(list(poly.exterior.coords),fill=(*bytes.fromhex(color[1:]),145))
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
