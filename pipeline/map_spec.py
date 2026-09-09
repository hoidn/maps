"""One geographic frame; geographic/map coordinates preserve the authored convention.
Metric working coordinates are used for distance, buffers and network operations.
"""
from dataclasses import dataclass
from functools import cached_property
from pathlib import Path
import json,math
from pyproj import CRS,Transformer,Geod
MAPS=Path(__file__).with_name('maps')
@dataclass(frozen=True)
class MapSpec:
 id:str
 title:str
 bbox:tuple
 width:int=1300
 height:int=1070
 subtitle:str='Trails and terrain'
 contour_intervals:tuple=(250,100,50)
 buffer_degrees:float=.015
 required_names:tuple=()
 required_routes:tuple=()
 sources:tuple=()
 @classmethod
 def load(cls,name='grand_canyon'):
  p=Path(name)
  if not p.is_file():p=MAPS/(str(name)+'.json')
  return cls.from_dict(json.loads(p.read_text()))
 @classmethod
 def from_dict(cls,d):
  b=tuple(d['bbox'])
  if len(b)!=4 or not all(math.isfinite(v) for v in b) or not(-180<=b[0]<b[2]<=180 and -90<b[1]<b[3]<90):raise ValueError('Invalid frame extent')
  if d.get('width',1300)<=0 or d.get('height',1070)<=0:raise ValueError('Invalid frame dimensions')
  return cls(d['id'],d['title'],b,d.get('width',1300),d.get('height',1070),d.get('subtitle','Trails and terrain'),tuple(d.get('contourIntervalsFeet',[250,100,50])),d.get('bufferDegrees',.015),tuple(d.get('requiredNames',[])),tuple(d.get('requiredRoutes',[])),tuple(d.get('sources',[])))
 @property
 def center(self):return ((self.bbox[1]+self.bbox[3])/2,(self.bbox[0]+self.bbox[2])/2)
 @property
 def frame(self):return {'version':1,'bbox':list(self.bbox),'width':self.width,'height':self.height,'projection':'geographic-affine','coordinateOrder':'latitude-longitude','workingCRS':self.crs.to_string()}
 @cached_property
 def crs(self):
  lat,lon=self.center
  return CRS.from_proj4(f'+proj=aeqd +lat_0={lat} +lon_0={lon} +datum=WGS84 +units=m +no_defs')
 @cached_property
 def _forward(self):return Transformer.from_crs(4326,self.crs,always_xy=True)
 @cached_property
 def _inverse(self):return Transformer.from_crs(self.crs,4326,always_xy=True)
 def metric(self,lat,lon):return self._forward.transform(lon,lat)
 def geographic(self,x,y):
  lon,lat=self._inverse.transform(x,y);return lat,lon
 def project(self,lat,lon):
  west,south,east,north=self.bbox
  return ((lon-west)/(east-west)*self.width,(north-lat)/(north-south)*self.height)
 def unproject(self,x,y):
  west,south,east,north=self.bbox
  return north-y/self.height*(north-south),west+x/self.width*(east-west)
 @property
 def meters_per_map_unit(self):
  lat,_=self.center
  return Geod(ellps='WGS84').inv(self.bbox[0],lat,self.bbox[2],lat)[2]/self.width
 def validate_cache(self,data,*,allow_legacy=False):
  if 'frame' not in data:
   if allow_legacy:return
   raise ValueError('Missing cache frame')
  if data['frame']!=self.frame:raise ValueError('Cache frame does not match map specification')
 @property
 def overpass_bbox(self):
  w,s,e,n=self.bbox;b=self.buffer_degrees
  return (s-b,w-b,n+b,e+b)
