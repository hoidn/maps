"""Registered USGS 3DEP elevation subsets; north-up PixelIsArea, float32 metres.

 fetch(spec, root) writes dem.tif (raw), dem.npy, dem.json, and source records.
 Pixel centers, rather than the bounding-box edges, locate the array samples.
 """
from pathlib import Path
import io,os,tempfile
import numpy as np
import requests,tifffile
from scipy.ndimage import map_coordinates
from .agency import HEADERS
from .catalog import atomic_json,record_source,utc_now,sha256
URL='https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage'

def atomic_bytes(path,data):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.NamedTemporaryFile(dir=path.parent,delete=False) as f:
  f.write(data);name=f.name
 try:os.replace(name,path)
 finally:
  if os.path.exists(name):os.unlink(name)

def read_geotiff(content,expected_epsg):
 """Read and independently validate north-up affine registration from TIFF tags."""
 with tifffile.TiffFile(io.BytesIO(content)) as f:
  array=f.asarray();meta=f.geotiff_metadata or {}
  if array.ndim!=2:raise ValueError('Raster must contain one two-dimensional band')
  if int(meta.get('GTRasterTypeGeoKey',0))!=1:raise ValueError('Raster must be PixelIsArea')
  if int(meta.get('ProjectedCSTypeGeoKey',meta.get('GeographicTypeGeoKey',0)))!=expected_epsg:raise ValueError('Unexpected raster CRS')
  transform=meta.get('ModelTransformation')
  if transform:
   if transform[0][1]!=0 or transform[1][0]!=0:raise ValueError('Rotated raster is unsupported')
   dx,dy,left,top=transform[0][0],-transform[1][1],transform[0][3],transform[1][3]
  else:
   scale=meta.get('ModelPixelScale');tie=meta.get('ModelTiepoint')
   if scale is None or tie is None:raise ValueError('Missing raster affine registration')
   dx,dy=scale[:2];left=tie[3]-tie[0]*dx;top=tie[4]+tie[1]*dy
  if dx<=0 or dy<=0:raise ValueError('Raster must be north-up')
  height,width=array.shape;bbox=[left,top-height*dy,left+width*dx,top]
  tag=f.pages[0].tags.get(42113);nodata=float(tag.value.rstrip('\x00')) if tag else None
 return array,{'bbox':bbox,'shape':list(array.shape),'epsg':expected_epsg,'pixelRegistration':'area','sampleLocation':'center','pixelSize':[dx,dy],'nodata':nodata}

def validate_grid(array,bbox,spec,expected_shape,nodata=None):
 if array.shape!=tuple(expected_shape):raise ValueError('Elevation raster shape does not match request')
 if max(abs(float(a)-b) for a,b in zip(bbox,spec.bbox))>2e-4:raise ValueError('Elevation raster extent does not match map frame')
 if not np.isfinite(array).all() or (nodata is not None and np.any(array==nodata)) or np.any(array < -500) or np.any(array > 9000):raise ValueError('Elevation contains missing or invalid samples')

def resample_to_frame(array,source_bbox,target_bbox):
 """Put accepted near-frame exports on the exact map grid, at pixel centers."""
 height,width=array.shape;sw,ss,se,sn=source_bbox;tw,ts,te,tn=target_bbox
 x=tw+(np.arange(width)+.5)*(te-tw)/width;y=tn-(np.arange(height)+.5)*(tn-ts)/height
 xx,yy=np.meshgrid(x,y)
 columns=(xx-sw)/(se-sw)*width-.5;rows=(sn-yy)/(sn-ss)*height-.5
 return map_coordinates(array,[rows,columns],order=1,mode='nearest',prefilter=False).astype(np.float32)

def fetch(spec,root,*,width=2600):
 root=Path(root);west,south,east,north=spec.bbox;height=round(width*(north-south)/(east-west))
 params={'bbox':','.join(map(str,spec.bbox)),'bboxSR':4326,'imageSR':4326,'size':f'{width},{height}','format':'tiff','pixelType':'F32','noDataInterpretation':'esriNoDataMatchAny','interpolation':'RSP_BilinearInterpolation','f':'json'}
 response=requests.get(URL,params=params,headers=HEADERS,timeout=300);response.raise_for_status();data=response.json()
 if 'error' in data:raise ValueError(str(data['error']))
 ext=data['extent'];bbox=[ext['xmin'],ext['ymin'],ext['xmax'],ext['ymax']]
 if max(abs(a-b) for a,b in zip(bbox,spec.bbox))>2e-4:raise ValueError('Elevation service expanded requested extent')
 raw=requests.get(data['href'],headers=HEADERS,timeout=900);raw.raise_for_status()
 array,registration=read_geotiff(raw.content,4326);array=array.astype(np.float32)
 validate_grid(array,registration['bbox'],spec,(height,width),registration['nodata'])
 native_registration=registration
 array=resample_to_frame(array,registration['bbox'],spec.bbox)
 registration={**registration,'bbox':list(spec.bbox),'pixelSize':[(east-west)/width,(north-south)/height]}
 path=root/'dem.tif';atomic_bytes(path,raw.content)
 source=record_source(path,provider='USGS 3DEP',url=response.url,retrieved_at=utc_now(),dataset_version='3DEP service snapshot; constituent survey dates vary',bbox=spec.bbox)
 bio=io.BytesIO();np.save(bio,array);atomic_bytes(root/'dem.npy',bio.getvalue())
 result={'version':1,'frame':spec.frame,'bbox':list(spec.bbox),'registration':registration,'nativeRegistration':native_registration,'resampling':'bilinear at pixel centers','shape':list(array.shape),'units':'metres','dtype':'float32','source':source,'arraySha256':sha256(root/'dem.npy'),'min':float(array.min()),'max':float(array.max())}
 atomic_json(root/'dem.json',result);return result
