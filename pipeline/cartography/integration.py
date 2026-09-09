"""Adapter preserving authored page composition while sharing geographic rendering."""
from pathlib import Path
import json,xml.etree.ElementTree as ET
from map_spec import MapSpec
from .catalog import load_catalog
from .scene import augment_svg
from .furniture import grid
from .terrain import neutral_relief,cover_image,COVER,COVER_DARK,COVER_KEY
from sources.catalog import atomic_json
from label_manifest import NS,safe_json

def improve(svg,manifest,dem,spec_name='grand_canyon'):
 spec=MapSpec.load(spec_name);root=Path('cache')/spec.id
 if not (root/'features.json').exists():return svg,None # deterministic legacy fixture adapter
 catalog=load_catalog(spec);svg,report=augment_svg(svg,manifest,spec,catalog)
 tree=ET.fromstring(svg);shade=neutral_relief(dem,spec)
 if manifest.mode=='interactive':
  for parent in tree.iter():
   for element in list(parent):
    if 'scale' in element.get('class','').split():parent.remove(element)
 for e in tree:
  if e.tag=='{'+NS+'}image' and 'terrain' in e.get('class','').split():e.set('href',shade['uri_dark' if 't-dark' in e.get('class','') else 'uri_light'])
 index=max((i for i,e in enumerate(tree) if 'terrain' in e.get('class','').split()),default=0)
 for offset,theme in enumerate(('light','dark'),1):
  land=ET.Element('{'+NS+'}image',{'class':'landcover t-'+theme,'href':cover_image(spec,catalog['features'],root,theme=theme),'x':'0','y':'0','width':str(spec.width),'height':str(spec.height),'preserveAspectRatio':'none'})
  tree.insert(index+offset,land)
 grid_element=ET.fromstring(grid(spec))
 for c in grid_element.iter():c.tag='{'+NS+'}'+c.tag
 tree.append(grid_element)
 report.update(frame=spec.frame,sources=catalog['sources'],catalogCounts=catalog['counts'],enrichment=catalog['enrichment'],sourceInventory=catalog.get('sourceInventory',{}),sourceIssues=catalog.get('sourceIssues',{}))
 atomic_json(root/('scene-'+manifest.mode+'.json'),report)
 manifest.cartography={'inventory':report['selected'],'omissions':report['omitted'],'sources':report['sources'],'enrichment':report['enrichment']}
 return ET.tostring(tree,encoding='unicode'),{'catalog':catalog,'report':report,'spec':spec,'mode':manifest.mode}

def catalog_panel(context):
 if not context:return ''
 from html import escape
 from .furniture import detail_inset
 catalog=context['catalog'];report=context['report'];spec=context['spec']
 interaction=' Select any trail to emphasize it.' if context.get('mode','interactive')=='interactive' else ''
 styles=report['styles'];active=[]
 for st in styles:
  desc=st['class'].replace('_',' ')+' · '+st['surface']+' surface'
  if st['color']=='restricted':desc+=' · restricted or inactive'
  if desc not in active:active.append(desc)
 legend=''.join('<li>'+escape(t)+'</li>' for t in sorted(active))
 distances=''.join('<tr><td>'+escape(e.get('name') or 'Unnamed path')+'</td><td>'+', '.join(f'{v:.4f}' for v in reversed(e['geometry']['coordinates'][0]))+' → '+', '.join(f'{v:.4f}' for v in reversed(e['geometry']['coordinates'][-1]))+'</td><td>'+f'{e["meters"]/1609.344:.2f} mi / {e["meters"]/1000:.2f} km'+'</td></tr>' for e in catalog['distances'])
 bounds=[f for f in catalog['features'] if f['kind']=='boundary'];rows=''.join('<tr><td>'+escape(f.get('name') or 'Unnamed unit')+'</td><td>'+escape(str(f.get('properties',{}).get('designation') or f.get('tags',{}).get('protect_class') or 'Protected-area boundary'))+'</td><td>'+escape(str(f.get('properties',{}).get('manager') or f.get('tags',{}).get('operator') or f['provider']))+'</td></tr>' for f in bounds)
 gaps=catalog.get('sourceInventory',{}).get('missing',[])
 source_note='<p>Requested region sources unavailable: '+escape(', '.join(gaps))+'. Retained legacy terrain is separately documented; cached data does not establish current conditions.</p>' if gaps else ''
 sources=''.join('<li>'+escape(str(s['provider']))+' · dataset '+escape(str(s['datasetVersion']))+' · retrieved '+escape(str(s['retrievedAt']))+'</li>' for s in catalog['sources'])
 return '<section class="cartographic-context"><h2>Map detail</h2>'+detail_inset(catalog['features'],spec)+'<details><summary>Road and trail key</summary><ul>'+legend+'</ul><p>Importance sets road width and casing; dashes distinguish surface, access and physical trail attributes. Missing attributes remain unknown.'+interaction+'</p></details><details><summary>Junction distances</summary><p>WGS84 geodesic length along OSM nodes, split at actual junctions and attribute boundaries. Endpoint coordinates distinguish nearby disconnected paths. Segment lengths also appear on the map where scale and space permit; a name has higher priority. Values describe mapped geometry, not current access.</p><table><thead><tr><th>Path</th><th>From → to (latitude, longitude)</th><th>Length</th></tr></thead><tbody>'+distances+'</tbody></table></details><details><summary>Protected areas and management context</summary><table><thead><tr><th>Unit</th><th>Designation</th><th>Manager / source</th></tr></thead><tbody>'+rows+'</tbody></table></details><details><summary>Source inventory and dates</summary>'+source_note+'<ul>'+sources+'</ul></details></section><script type="application/json" id="map-cartography-catalog">'+safe_json({'frame':spec.frame,'counts':catalog['counts'],'sources':catalog['sources'],'omissions':report['omitted'],'distances':catalog['distances'],'sourceInventory':catalog.get('sourceInventory',{}),'sourceIssues':catalog.get('sourceIssues',{}),'sceneCounts':report['selected'],'enrichment':catalog['enrichment']})+'</script>'

def transport_legend(context):
 if not context:return None
 from html import escape
 out=['<span class="lg-title">Mapped transport</span>'];seen=set()
 for st in sorted(context['report']['styles'],key=lambda s:(s['kind'],-s['importance'],s['surface'],s['class'])):
  key=(st['kind'],st['importance'],st['surface'],st['color'])
  if key in seen:continue
  seen.add(key);color={'road':'var(--road-fill)','trail':'var(--trail-ink)','restricted':'var(--restricted-ink)'}[st['color']]
  dash=','.join(map(str,st['dash'])) or 'none';label=st['class'].replace('_',' ')+' · '+st['surface']
  if st['color']=='restricted':label+=' · restricted/inactive'
  case=f'<path d="M1,7 H33" stroke="var(--road)" stroke-width="{st["caseWidth"]}"/>' if st['caseWidth'] else ''
  out.append(f'<span class="lg-item"><svg viewBox="0 0 34 14" width="34" height="14">{case}<path d="M1,7 H33" stroke="{color}" stroke-width="{st["width"]}" stroke-dasharray="{dash}"/></svg>{escape(label)}</span>')
 if context['report'].get('selected',{}).get('railway',0):
  out.append('<span class="lg-item"><svg data-symbol="railway" viewBox="0 0 34 14" width="34" height="14" aria-hidden="true"><path d="M1,7 H33" fill="none" stroke="var(--ink)" stroke-width=".8"/><path d="M1,7 H33" fill="none" stroke="var(--ink)" stroke-width="3.6" stroke-linecap="butt" stroke-dasharray="1,6"/></svg>Railway · faint/dashed: inactive or unbuilt alignment</span>')
 if context['report'].get('selected',{}).get('barrier',0):
  out.append('<span class="lg-item"><svg viewBox="0 0 34 14" width="34" height="14" aria-hidden="true"><path d="M1,7 H33" fill="none" stroke="var(--ink)" stroke-width=".65" stroke-dasharray="2,2"/></svg>Fence / wall · not an access designation</span>')
 from .symbols import symbol_svg
 facility_names={'camp':'Campground / campsite','toilets':'Toilets','shop':'Supplies','fuel':'Fuel','bench':'Bench','waste':'Waste disposal','saddle':'Saddle','gate':'Gate','barrier':'Barrier','picnic':'Picnic area / table','telephone':'Telephone','ford':'Ford','crossing':'Road crossing'}
 active=context['report'].get('facilitySymbols',{})
 if any(active.get(kind) for kind in facility_names):
  out.append('<span class="lg-title">Facilities and crossings · access and availability unverified</span>')
  for kind,label in facility_names.items():
   if active.get(kind):out.append(f'<span class="lg-item"><svg viewBox="-8 -8 16 16" width="16" height="16" aria-hidden="true">{symbol_svg(kind)}</svg>{label}</span>')
 interaction='Select a trail to emphasize it. ' if context.get('mode','interactive')=='interactive' else ''
 out.append('<span class="lg-item">'+interaction+'Class, surface, access and hiking difficulty are independent attributes.</span>')
 coarse,medium,fine=context['spec'].contour_intervals
 out.append('<span class="lg-title">Land cover</span>')
 for category,label in COVER_KEY:
  out.append(f'<span class="lg-item"><i class="cover-swatch" style="--cover-light:{COVER[category]};--cover-dark:{COVER_DARK[category]}"></i>{label}</span>')
 out.append(f'<span class="lg-title">Terrain and water</span><span class="lg-item">Contours: {coarse} ft; {medium} ft and {fine} ft appear with detail. Blue: mapped water; dashed blue: explicitly intermittent. Fill: water area. Purple dash-dot: protected area.</span>')
 return ''.join(out)
