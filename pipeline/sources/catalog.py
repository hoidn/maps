"""Source identity and acquisition evidence, kept separate from dataset survey date."""
from pathlib import Path
import hashlib,json,os,tempfile
from datetime import datetime,timezone

def sha256(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def utc_now():return datetime.now(timezone.utc).isoformat()
def atomic_json(path,data):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.NamedTemporaryFile(mode='w',dir=path.parent,delete=False,encoding='utf-8') as f:
  json.dump(data,f,ensure_ascii=False,allow_nan=False);temporary=f.name
 try:os.replace(temporary,path)
 finally:
  if os.path.exists(temporary):os.unlink(temporary)
def record_source(path,*,provider,url,retrieved_at,dataset_version,bbox,attribution=None):
 record={'provider':provider,'url':url,'retrievedAt':retrieved_at,'datasetVersion':dataset_version,'bbox':list(bbox),'sha256':sha256(path),'bytes':Path(path).stat().st_size,'attribution':attribution or provider}
 atomic_json(str(path)+'.source.json',record)
 return record

def verify_source(path,record):return sha256(path)==record['sha256']
