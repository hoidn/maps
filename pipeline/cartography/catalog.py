"""Network-free catalog assembly with source inventory and explicit omission reasons."""
from pathlib import Path
from collections import Counter
import json
import numpy as np
from sources.catalog import atomic_json,verify_source,sha256
from .hydro import combine_hydro
from .names import merge_names
from .route_graph import junction_segments

PROVIDER_CACHES={'osm':('features.json',),'gnis':('gnis-features.json',),'3dhp':('usgs_hydro-features.json',),'padus':('boundaries-features.json',),'nlcd':('landcover.npy','landcover.json'),'3dep':('dem.npy','dem.json')}

def load_catalog(spec,root=None):
 root=Path(root or 'cache')/spec.id
 base=json.loads((root/'features.json').read_text());spec.validate_cache(base)
 for name in ('landcover','dem'):
  path=root/(name+'.npy')
  if not path.exists():continue
  meta=json.loads(path.with_suffix('.json').read_text());spec.validate_cache(meta)
  if meta.get('arraySha256')!=sha256(path):raise ValueError(name+' cache array hash mismatch')
  array=np.load(path,allow_pickle=False,mmap_mode='r')
  if list(array.shape)!=meta.get('shape') or str(array.dtype)!=meta.get('dtype'):raise ValueError(name+' cache shape or dtype mismatch')
  if name=='landcover':
   from sources.landcover import validate_categories
   validate_categories(array)
   if meta.get('bbox')!=list(spec.bbox):raise ValueError('Land-cover cache extent does not match frame')
 source_issues={}
 def read(name):
  p=root/(name+'-features.json')
  if not p.exists():return []
  d=json.loads(p.read_text())
  if not isinstance(d,dict):raise ValueError('Missing national cache frame: '+str(p))
  spec.validate_cache(d);source_issues[name]=d.get('issues',[])
  return d['features']
 names=read('gnis');hydro=read('usgs_hydro');boundaries=read('boundaries')
 fs=base['features'];osm_h=[f for f in fs if f['kind'] in ('waterway','waterbody')]
 hs,hreport=combine_hydro(osm_h,hydro,spec)
 fs=[f for f in fs if f['kind'] not in ('waterway','waterbody')]+hs
 fs,nreport=merge_names(fs,names)
 # Explicit IDs suppress only identical gazetteer features already represented.
 represented={str(f.get('properties',{}).get('gnisId') or f.get('tags',{}).get('gnis:feature_id') or '') for f in fs if f.get('name')}
 fs += [f for f in names if str(f['properties'].get('gnisId')) not in represented]
 fs += boundaries
 sources=[]
 for p in sorted(root.glob('*.source.json')):
  raw=Path(str(p)[:-len('.source.json')]);record=json.loads(p.read_text())
  if not verify_source(raw,record):raise ValueError('Source hash mismatch: '+str(raw))
  sources.append(record)
 inventory={'requested':list(spec.sources),'available':[],'missing':[],'details':[]}
 for provider in spec.sources:
  files=PROVIDER_CACHES.get(provider,())
  missing=[name for name in files if not (root/name).exists()]
  available=bool(files) and not missing
  inventory['available' if available else 'missing'].append(provider)
  inventory['details'].append({'provider':provider,'status':'cached' if available else 'missing','missingFiles':missing,'reason':None if available else ('No source adapter registered' if not files else 'Requested region cache unavailable; fallback does not establish source currency')})
 result={**base,'sourceInventory':inventory,'sourceIssues':source_issues,'sourceIssueCounts':{'osm':len(base.get('issues',[])),**{name:len(issues) for name,issues in source_issues.items()}},'features':fs,'counts':dict(Counter(f['kind'] for f in fs)),'sources':sources,'enrichment':{'hydro':hreport,'names':nreport},'distances':junction_segments(base['features'])}
 atomic_json(root/'catalog.json',result)
 return result
