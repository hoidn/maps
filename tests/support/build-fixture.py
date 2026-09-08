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
if __name__=='__main__': create(sys.argv[1])
