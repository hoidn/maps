"""Ground-scale furniture and data-selected developed-area detail (no place rules)."""
import math
from html import escape
from collections import Counter
from shapely.geometry import box
from .scene import map_geometry,parts,polygon_path
from path_geometry import detail_path

def scale_distance(meters_per_pixel,max_pixels=120):
 target=meters_per_pixel*max_pixels;power=10**math.floor(math.log10(target));meters=max(n*power for n in (1,2,5,10) if n*power<=target)
 return meters,meters/meters_per_pixel

def coordinate_ticks(spec):
 w,s,e,n=spec.bbox;step=10**math.floor(math.log10(max(e-w,n-s)/4));precision=max(0,-math.floor(math.log10(step)))
 for axis,lo,hi in (('lon',w,e),('lat',s,n)):
  for i in range(math.ceil(lo/step),math.floor(hi/step)+1):
   value=i*step
   label=f'{abs(value):.{precision}f}° {("E" if value>=0 else "W") if axis=="lon" else ("N" if value>=0 else "S")}'
   yield axis,value,label

def grid(spec):
 w,s,e,n=spec.bbox;out=[]
 for axis,value,label in coordinate_ticks(spec):
  if axis=='lon':x,_=spec.project(n,value);d=f'M{x:.3f},0 V{spec.height}';tx,ty=x+3,spec.height-8
  else:_,y=spec.project(value,w);d=f'M0,{y:.3f} H{spec.width}';tx,ty=5,y-4
  tx=min(spec.width-5,max(5,tx));ty=min(spec.height-5,max(12,ty));anchor='end' if tx>spec.width-80 else 'start'
  out.append(f'<path d="{d}"/><text x="{tx:.3f}" y="{ty:.3f}" text-anchor="{anchor}">{label}</text>')
 return '<g class="coordinate-grid">'+''.join(out)+'</g>'

def detail_inset(features,spec):
 counts=Counter();points=[]
 for f in features:
  if f['kind'] not in ('building','poi'):continue
  g=map_geometry(f,spec)
  if g.is_empty:continue
  p=g.representative_point();key=(int(p.x//100),int(p.y//100));counts[key]+=1;points.append((key,p))
 if not counts:return ''
 k=max(sorted(counts),key=counts.get);cx,cy=k[0]*100+50,k[1]*100+50;side=170;x=min(spec.width-side,max(0,cx-side/2));y=min(spec.height-side,max(0,cy-side/2));clip=box(x,y,x+side,y+side);out=[]
 for f in features:
  if f['kind'] not in ('road','trail','building','waterbody'):continue
  g=map_geometry(f,spec).intersection(clip)
  if g.is_empty:continue
  if f['kind'] in ('building','waterbody'):d=polygon_path(g);style='fill:'+('var(--building-fill)' if f['kind']=='building' else 'var(--water-fill)')+';stroke:none'
  else:d=''.join(detail_path(list(line.coords),.025) for line in parts(g,'LineString'));style='fill:none;stroke:'+('var(--road-case)' if f['kind']=='road' else 'var(--trail-ink)')+';stroke-width:.6'
  out.append(f'<path d="{d}" style="{style}" fill-rule="evenodd"/>')
 locator=f'<svg viewBox="0 0 {spec.width} {spec.height}" width="100" aria-label="Detail locator"><rect width="{spec.width}" height="{spec.height}" fill="none" stroke="currentColor" stroke-width="12"/><rect x="{x}" y="{y}" width="{side}" height="{side}" fill="var(--trail-ink)"/></svg>'
 return '<figure><svg class="detail-inset" viewBox="'+f'{x} {y} {side} {side}'+'" role="img" aria-label="Developed-area street and building detail">'+''.join(out)+'</svg>'+locator+'<figcaption>Developed-area detail · selected by facility density · locator shows its position in the sheet.</figcaption></figure>'
