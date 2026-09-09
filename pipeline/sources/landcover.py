"""Annual NLCD category grids, sampled nearest-neighbor from native 30 m EPSG:5070.

 fetch(spec, root) writes landcover-native.tif, landcover.npy (north-up uint8),
 landcover.json (frame, categories, registration, source); never interpolate classes.
 """
from pathlib import Path
import io,math
import xml.etree.ElementTree as ET
import numpy as np,requests
from pyproj import Transformer
from .agency import HEADERS
from .catalog import atomic_json,record_source,utc_now,sha256
from .elevation import atomic_bytes,read_geotiff
URL='https://dmsdata.cr.usgs.gov/geoserver/mrlc_Land-Cover-Native_conus_year_data/wcs'
COVERAGE='mrlc_Land-Cover-Native_conus_year_data:Land-Cover-Native_conus_year_data'
CATEGORIES={11:'Open water',12:'Perennial ice/snow',21:'Developed, open space',22:'Developed, low intensity',23:'Developed, medium intensity',24:'Developed, high intensity',31:'Barren land',41:'Deciduous forest',42:'Evergreen forest',43:'Mixed forest',52:'Shrub/scrub',71:'Grassland/herbaceous',81:'Pasture/hay',82:'Cultivated crops',90:'Woody wetlands',95:'Emergent herbaceous wetlands'}

def validate_categories(array):
 if array.ndim!=2 or not np.issubdtype(array.dtype,np.integer):raise ValueError('Land cover must be a two-dimensional integer category band')
 unknown=set(map(int,np.unique(array)))-set(CATEGORIES)
 if unknown:raise ValueError('Unknown or missing land-cover categories: '+str(sorted(unknown)))

def sample_categories(array,source_bbox,target_bbox,shape,transform=None):
 """Nearest native cell at target pixel centers; fail instead of clamping gaps."""
 sw,ss,se,sn=source_bbox;tw,ts,te,tn=target_bbox;height,width=shape
 x=tw+(np.arange(width)+.5)*(te-tw)/width;y=tn-(np.arange(height)+.5)*(tn-ts)/height
 xx,yy=np.meshgrid(x,y)
 if transform is not None:xx,yy=transform.transform(xx,yy)
 col=np.floor((xx-sw)/(se-sw)*array.shape[1]).astype(int)
 row=np.floor((sn-yy)/(sn-ss)*array.shape[0]).astype(int)
 if np.any(col<0) or np.any(col>=array.shape[1]) or np.any(row<0) or np.any(row>=array.shape[0]):raise ValueError('Land-cover source does not cover requested frame')
 result=array[row,col];validate_categories(result);return result

def native_grid(description):
 """Use WCS pixel-center origin and offsets to derive the native edge lattice."""
 ns={'gml':'http://www.opengis.net/gml'}
 node=ET.fromstring(description).find('.//gml:RectifiedGrid',ns)
 if node is None or node.get('srsName')!='EPSG:5070':raise ValueError('Unexpected NLCD native grid CRS')
 origin=[float(v) for v in node.find('gml:origin/gml:pos',ns).text.split()]
 offsets=[[float(v) for v in e.text.split()] for e in node.findall('gml:offsetVector',ns)]
 low=[int(v) for v in node.find('gml:limits/gml:GridEnvelope/gml:low',ns).text.split()]
 high=[int(v) for v in node.find('gml:limits/gml:GridEnvelope/gml:high',ns).text.split()]
 if len(origin)!=2 or offsets!=[[30.,0.],[0.,-30.]] or low!=[0,0]:raise ValueError('Unexpected NLCD native grid orientation or resolution')
 return {'epsg':5070,'centerOrigin':origin,'edgeOrigin':[origin[0]-15,origin[1]+15],'pixelSize':[30.,30.],'shape':[high[1]+1,high[0]+1]}

def snap_native_bounds(bounds,grid):
 """Expand to source cell edges, whose offset need not be a multiple of size."""
 x,y=grid['edgeOrigin'];dx,dy=grid['pixelSize']
 return [x+math.floor((bounds[0]-x)/dx)*dx,y+math.floor((bounds[1]-y)/dy)*dy,x+math.ceil((bounds[2]-x)/dx)*dx,y+math.ceil((bounds[3]-y)/dy)*dy]

def fetch(spec,root,*,year=2025,width=1300):
 root=Path(root);transform=Transformer.from_crs(4326,5070,always_xy=True)
 description=requests.get(URL,params={'service':'WCS','version':'1.0.0','request':'DescribeCoverage','coverage':COVERAGE},headers=HEADERS,timeout=90);description.raise_for_status()
 grid=native_grid(description.content)
 bounds=transform.transform_bounds(*spec.bbox,densify_pts=31)
 bbox=snap_native_bounds(bounds,grid)
 nw,nh=round((bbox[2]-bbox[0])/30),round((bbox[3]-bbox[1])/30)
 params={'service':'WCS','version':'1.0.0','request':'GetCoverage','coverage':COVERAGE,'crs':'EPSG:5070','response_crs':'EPSG:5070','bbox':','.join(map(str,bbox)),'width':nw,'height':nh,'format':'GeoTIFF','time':f'{year}-01-01T00:00:00.000Z','interpolation':'nearest neighbor'}
 response=requests.get(URL,params=params,headers=HEADERS,timeout=300);response.raise_for_status()
 array,registration=read_geotiff(response.content,5070)
 if array.shape!=(nh,nw) or max(abs(a-b) for a,b in zip(registration['bbox'],bbox))>.1:raise ValueError('Native NLCD grid registration differs from request')
 if any(abs(v-30)>1e-5 for v in registration['pixelSize']):raise ValueError('Native NLCD pixel size differs from source grid')
 validate_categories(array)
 metadata_path=root/'landcover-description.xml';atomic_bytes(metadata_path,description.content)
 grid_source=record_source(metadata_path,provider='USGS Annual NLCD WCS grid description',url=description.url,retrieved_at=utc_now(),dataset_version=f'Annual NLCD grid description for {year} request',bbox=spec.bbox)
 height=round(width*spec.height/spec.width)
 sampled=sample_categories(array,registration['bbox'],spec.bbox,(height,width),transform)
 path=root/'landcover-native.tif';atomic_bytes(path,response.content)
 source=record_source(path,provider='USGS Annual NLCD',url=response.url,retrieved_at=utc_now(),dataset_version=f'Annual NLCD land cover {year}; native 30 m',bbox=spec.bbox)
 bio=io.BytesIO();np.save(bio,sampled);atomic_bytes(root/'landcover.npy',bio.getvalue())
 values,counts=np.unique(sampled,return_counts=True)
 result={'version':1,'frame':spec.frame,'bbox':list(spec.bbox),'shape':list(sampled.shape),'dtype':'uint8','pixelRegistration':'area','sampleLocation':'center','resampling':'nearest','nativeGrid':grid,'nativeGridSource':grid_source,'nativeRegistration':registration,'source':source,'arraySha256':sha256(root/'landcover.npy'),'categories':CATEGORIES,'counts':{str(v):int(c) for v,c in zip(values,counts)}}
 atomic_json(root/'landcover.json',result);return result
