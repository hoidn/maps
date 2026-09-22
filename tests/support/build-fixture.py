"""Produce small deterministic inputs for both builders; never accesses the network."""
from pathlib import Path
import re, json, io, base64, sys
import numpy as np
from PIL import Image

def create(directory):
    directory=Path(directory);directory.mkdir(parents=True,exist_ok=True)
    repo=Path(__file__).resolve().parents[2]
    source=(repo/'pipeline/build_interactive.py').read_text()
    names=set(re.findall(r'"([^"\n]+(?:Trail|Route|Bridge|Tunnel))"',source))
    elements=[]; nextid=1
    for index,name in enumerate(sorted(names)):
        # Trail-specific endpoints supply nonzero chains long enough for the profile.
        lat=36.21 if 'Kaibab' in name else 36.18
        lon=-112.22+(index%12)*.022
        ids=[]
        for step in range(30):
            pointlat, pointlon = lat-step*.004, lon+step*.001
            if name in ('Tonto Trail','Rim Trail'):
                pointlat,pointlon = (36.077 if name=='Tonto Trail' else 36.057)+step*.0001, -112.26+step*.013
            ids.append(nextid);elements.append(dict(type='node',id=nextid,lat=pointlat,lon=pointlon));nextid+=1
        elements.append(dict(type='way',id=nextid,nodes=ids,tags={'name':name,'highway':'path'}));nextid+=1
    elements.append(dict(type='node',id=nextid,lat=36.10,lon=-112.15,tags={'natural':'peak','name':'Fixture Peak','ele':'1800'}))
    (directory/'osm.json').write_text(json.dumps({'elements':elements}))
    (directory/'osm2.json').write_text('{"elements":[]}')
    dem=np.linspace(2400,760,6400,dtype=np.float32).reshape(80,80)
    for name in ['dem.npy','dem_hi.npy']: np.save(directory/name,dem)
    b=io.BytesIO();Image.new('RGB',(4,4),'#d8c6a1').save(b,format='JPEG')
    uri='data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode()
    contours={'index':[{'lv':4000,'d':['M50,200 400,350 850,450 1250,500']}], 'inter':[],'fine':[],'finest':[]}
    for name in ['terrain.json','terrain_hi.json']:
        (directory/name).write_text(json.dumps({'uri_light':uri,'uri_dark':uri,'contours':contours}))
    return directory
def create_region(directory):
    """Registered synthetic portable sources; exercise the real regional builder."""
    repo=Path(__file__).resolve().parents[2]
    sys.path.insert(0,str(repo/'pipeline'))
    from map_spec import MapSpec
    from sources.catalog import atomic_json,record_source,sha256
    directory=Path(directory);directory.mkdir(parents=True,exist_ok=True)
    config={'id':'sequoia','title':'Synthetic Regional Fixture','subtitle':'Test geometry, not real geography',
            'bbox':[-118.2,34.1,-118.1,34.175],'width':800,'height':600,'sources':['osm','3dep'],
            'requiredNames':['Synthetic Camp'],'requiredRoutes':[]}
    path=directory/'custom-region.json';atomic_json(path,config);spec=MapSpec.load(path)
    root=directory/'cache'/spec.id;root.mkdir(parents=True,exist_ok=True)
    features=[]
    for identity,kind,name,geometry,tags in [
        ('trail','trail','Synthetic Trail',{'type':'LineString','coordinates':[[-118.19,34.155],[-118.155,34.15],[-118.11,34.16]]},{'highway':'path'}),
        ('road','road','Synthetic Road',{'type':'LineString','coordinates':[[-118.19,34.12],[-118.11,34.12]]},{'highway':'secondary','surface':'asphalt'}),
        ('water','waterway','Synthetic Creek',{'type':'LineString','coordinates':[[-118.18,34.14],[-118.145,34.13],[-118.12,34.14]]},{'waterway':'stream'}),
        ('peak','poi','Synthetic Summit',{'type':'Point','coordinates':[-118.18,34.165]},{'natural':'peak','ele':'850'}),
        ('camp','poi','Synthetic Camp',{'type':'Point','coordinates':[-118.12,34.105]},{'tourism':'camp_site'}),
    ]:
        features.append({'id':'osm:synthetic:'+identity,'provider':'osm','kind':kind,'name':name,'geometry':geometry,'tags':tags,'properties':{},'routeIds':[]})
    atomic_json(root/'features.json',{'frame':spec.frame,'features':features,'routes':[],'issues':[]})
    y,x=np.mgrid[0:48,0:64];dem=(600+3*y+x).astype(np.float32);np.save(root/'dem.npy',dem)
    atomic_json(root/'dem.json',{'frame':spec.frame,'shape':list(dem.shape),'dtype':'float32','units':'metres','arraySha256':sha256(root/'dem.npy'),
                              'registration':{'bbox':list(spec.bbox),'pixelRegistration':'area','sampleLocation':'center'}})
    for name,provider in [('features.json','Synthetic OSM fixture'),('dem.npy','Synthetic elevation fixture')]:
        record_source(root/name,provider=provider,url='synthetic:test-fixture',retrieved_at='2026-01-01T00:00:00Z',dataset_version='synthetic-test-only',bbox=spec.bbox)
    return path

if __name__=='__main__':
    (create_region if '--regional' in sys.argv[2:] else create)(sys.argv[1])

