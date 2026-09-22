"""Lossless interactive contour payloads; frozen static SVG remains authored text.

Only exactly representable generated polylines are packed. Other SVG syntax is
retained byte-for-byte for the existing native renderer/fallback.
"""
import base64
import hashlib
import re
import zlib
from html.parser import HTMLParser
from label_manifest import json_script

_SCALE = 1000
_NUMBER = r'-?\d+\.\d{3}'
_RUN = re.compile(rf'{_NUMBER},{_NUMBER}(?: {_NUMBER},{_NUMBER})+')
_D = re.compile(r'''\sd\s*=\s*(["'])(.*?)\1''', re.S)

def _runs(d):
 if not d.startswith('M'):
  return None
 result=[]
 for run in d[1:].split('M'):
  if not _RUN.fullmatch(run):return None
  values=[round(float(n)*_SCALE) for n in re.split('[ ,]',run)]
  if any(n < -2147483648 or n > 2147483647 for n in values):return None
  if ' '.join(f'{values[i]/_SCALE:.3f},{values[i+1]/_SCALE:.3f}' for i in range(0,len(values),2))!=run:return None
  result.append(values)
 return result

def _uint(output,value):
 while value>=128:
  output.append((value%128)|128);value//=128
 output.append(value)

def _encode(items):
 output=bytearray(b'CTP1');_uint(output,len(items))
 for identity,runs,_ in items:
  _uint(output,identity);_uint(output,len(runs))
  for run in runs:
   _uint(output,len(run));previous=[0,0];delta=[0,0]
   for i,value in enumerate(run):
    axis=i%2;change=value-previous[axis];residual=change-delta[axis]
    _uint(output,residual*2 if residual>=0 else -residual*2-1)
    previous[axis]=value;delta[axis]=change
 return bytes(output)

class _Contours(HTMLParser):
 def __init__(self,svg):
  super().__init__(convert_charrefs=False);self.svg=svg;self.groups=[];self.edits=[];self.tiers={};self.count=0
  self.lines=[0]+[m.end() for m in re.finditer('\n',svg)]
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs);classes=attrs.get('class','').split()
  if tag=='g':
   contour=bool(self.groups and self.groups[-1][0]) or 'contours' in classes
   zoom=max(self.groups[-1][1] if self.groups else 0,4.5 if 'g-finest' in classes else 2 if 'g-fine' in classes else 0)
   self.groups.append((contour,zoom));return
  if tag!='path' or not self.groups or not self.groups[-1][0]:return
  if 'data-packed-contour' in attrs:raise ValueError('Contours already packed')
  d=attrs.get('d','');runs=_runs(d)
  if runs is None:return
  text=self.get_starttag_text();match=_D.search(text)
  if not match:return
  identity=self.count;self.count+=1
  self.tiers.setdefault(self.groups[-1][1],[]).append((identity,runs,d))
  line,column=self.getpos();start=self.lines[line-1]+column
  replaced=text[:match.start(2)]+text[match.end(2):match.end()]+f' data-packed-contour="{identity}"'+text[match.end():]
  self.edits.append((start,start+len(text),replaced))
 def handle_endtag(self,tag):
  if tag=='g' and self.groups:self.groups.pop()
 def handle_startendtag(self,tag,attrs):
  self.handle_starttag(tag,attrs)
  if tag=='g':self.handle_endtag(tag)

def pack_contours(svg,mode='interactive'):
 """Return SVG shells and an inert standalone payload script after finalization."""
 if mode=='static':return svg,''
 if mode!='interactive':raise ValueError('Unsupported contour output mode')
 parser=_Contours(svg);parser.feed(svg);parser.close()
 if not parser.edits:return svg,''
 tiers=[]
 for zoom,items in sorted(parser.tiers.items()):
  raw=_encode(items)
  tiers.append({'zoom':zoom,'ids':[identity for identity,_,_ in items],
   'coordinates':sum(len(run) for _,runs,_ in items for run in runs),
   'bytes':len(raw),'crc32':zlib.crc32(raw),'sourceSha256':hashlib.sha256('\0'.join(d for _,_,d in items).encode()).hexdigest(),
   'data':base64.b64encode(raw).decode('ascii')})
 parts=[];cursor=0
 for start,end,replacement in parser.edits:parts.extend((svg[cursor:start],replacement));cursor=end
 parts.append(svg[cursor:]);svg=''.join(parts)
 manifest={'version':1,'encoding':'delta2-varint','scale':_SCALE,'pathCount':parser.count,'tiers':tiers}
 script=json_script('map-contour-payload',manifest)
 return svg,script
