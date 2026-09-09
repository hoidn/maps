"""Conservative gazetteer enrichment: explicit source identity, never nearest name."""
from copy import deepcopy

def merge_names(features,names):
 by_id={str(n['properties'].get('gnisId')):n for n in names if n.get('name') and n['properties'].get('gnisId')}
 result=deepcopy(features);report={'idMatches':0,'conflicts':[],'unmatchedNames':[]};used=set()
 for f in result:
  gid=str(f.get('properties',{}).get('gnisId') or f.get('tags',{}).get('gnis:feature_id') or '')
  n=by_id.get(gid)
  if not n:continue
  used.add(gid)
  if not f.get('name'):f['name']=n['name'];f['nameSource']={'id':n['id'],'confidence':'explicit GNIS identity'};report['idMatches']+=1
  elif f['name']!=n['name']:report['conflicts'].append({'id':f['id'],'name':f['name'],'alternate':n['name'],'sourceId':n['id']})
 report['unmatchedNames']=[n['id'] for gid,n in by_id.items() if gid not in used]
 return result,report
