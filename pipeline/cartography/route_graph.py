"""Junction-to-junction length, preserving OSM node identity and edge attributes."""
from collections import Counter
from pyproj import Geod
GEOD=Geod(ellps='WGS84')
def junction_segments(features):
 ways=[f for f in features if f['kind']=='trail' and f['geometry']['type']=='LineString' and len(f.get('nodeIds',[]))==len(f['geometry']['coordinates'])]
 degree=Counter()
 for f in ways:
  ids=f['nodeIds']
  for a,b in zip(ids,ids[1:]):degree[a]+=1;degree[b]+=1
 result=[]
 for f in ways:
  ids=f['nodeIds'];coords=f['geometry']['coordinates'];start=0
  for i in range(1,len(ids)):
   if i!=len(ids)-1 and degree[ids[i]]==2:continue
   points=coords[start:i+1];meters=sum(GEOD.inv(*a,*b)[2] for a,b in zip(points,points[1:]))
   result.append({'id':f['id']+f':{start}-{i}','sourceId':f['id'],'fromNode':ids[start],'toNode':ids[i],'name':f.get('name'),'meters':meters,'geometry':{'type':'LineString','coordinates':points},'method':'WGS84 geodesic; OSM node topology','tags':f.get('tags',{}),'routeIds':f.get('routeIds',[])})
   start=i
 return result
