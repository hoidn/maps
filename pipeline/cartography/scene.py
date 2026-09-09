"""One geographic renderer for authored sheets and configurable regional sheets.

Source catalog remains untouched. Clipping/generalization apply only to paint copies.
Line label windows are anchored in world coordinates and carry source identity.
"""
from collections import Counter,defaultdict
from copy import deepcopy
from html import escape
import json,math,xml.etree.ElementTree as ET
from pathlib import Path
from functools import lru_cache
from PIL import ImageFont
from pyproj import Geod
from shapely.geometry import shape,box,LineString,Polygon
from shapely.ops import transform,substring,unary_union
from label_manifest import NS,stable_id
from path_geometry import detail_path
from features import feature_roles
from .transport import transport_style,visible_reference
from .hydro import hydro_style
from .poi import poi_style,SYMBOL_ONLY_SERVICES
from .symbols import symbol_svg
from .entities import match_display_repeats
from .text_importance import apply_text_importance

PALETTE={'road':'var(--road-fill)','trail':'var(--trail-ink)','restricted':'var(--restricted-ink)'}

def parts(g,kind):
 if g.is_empty:return
 if g.geom_type==kind:yield g
 elif hasattr(g,'geoms'):
  for p in g.geoms:yield from parts(p,kind)

def map_geometry(f,spec):
 g=shape(f['geometry']).intersection(box(*spec.bbox))
 return transform(lambda x,y,z=None:spec.project(y,x),g)

def polygon_path(g):
 out=[]
 for poly in parts(g,'Polygon'):
  for ring in [poly.exterior,*poly.interiors]:out.append(detail_path(list(ring.coords),.06)+'Z')
 return ''.join(out)

def poi_importance(tags,feature_class=None):
 """Navigation destinations are primary; detail density never sets importance.

 Ordinary services and natural attractions remain useful secondary features.
 Source categories, not spelling, geographic location or visibility outcomes,
 determine this hierarchy. Operational availability remains unverified.
 """
 if tags.get('place') in ('city','town','village','hamlet') or feature_class=='Populated Place':priority,reason=850,'settlement'
 elif tags.get('highway')=='trailhead':priority,reason=830,'trailhead'
 elif tags.get('tourism') in ('camp_site','wilderness_hut','alpine_hut'):priority,reason=820,'campground-or-refuge'
 elif tags.get('amenity')=='ranger_station':priority,reason=820,'ranger-station'
 elif tags.get('tourism')=='information' and tags.get('information')=='visitor_centre':priority,reason=820,'visitor-centre'
 elif tags.get('amenity') in ('bench','waste_basket','waste_disposal'):priority,reason=300,'local-convenience'
 elif tags.get('amenity')=='drinking_water':priority,reason=730,'mapped-water-facility'
 elif tags.get('natural') in ('spring','waterfall') or tags.get('waterway')=='waterfall':priority,reason=690,'natural-water-feature'
 elif tags.get('tourism') in ('hotel','motel','hostel','museum') or tags.get('amenity')=='shelter':priority,reason=690,'secondary-destination'
 elif tags.get('tourism')=='viewpoint':priority,reason=650,'viewpoint'
 elif tags.get('natural') in ('peak','saddle') or feature_class=='Summit':priority,reason=480,'topographic-point'
 elif tags.get('amenity')=='parking':priority,reason=510,'parking'
 else:priority,reason=550,'secondary-feature'
 return {'priority':priority,'importanceClass':'primary' if priority>=800 else 'local-detail' if priority<400 else 'secondary','priorityReason':reason}

def apply_point_importance(M,spec):
 """Unify authored/source semantics without changing anchors or eligibility.

 Symbols identify authored roles; font size alone does not make a viewpoint a
 primary destination. Explicit editorial requirements take precedence in every
 rendering mode. One canonical record is selected for a configured name so a
 second source representation does not become a second required destination.
 """
 role_tags={'th':{'highway':'trailhead'},'camp':{'tourism':'camp_site'},
            'view':{'tourism':'viewpoint'},'wp':{},
            'water':{'amenity':'drinking_water'},'shelter':{'amenity':'shelter'},
            'lodge':{'tourism':'hotel'}}
 roles=defaultdict(list)
 for a in M.annotations:
  if a.get('kind')=='symbol' and a.get('symbolKind') in role_tags:
   roles[a['featureId']].append(poi_importance(role_tags[a['symbolKind']]))
 labels=[a for a in M.annotations if a.get('kind')=='point-label']
 for a in labels:
  if not a.get('priorityReason') and roles[a['featureId']]:
   a.update(max(roles[a['featureId']],key=lambda role:role['priority']))
  if a.get('style')=='l-major' and a['priority']<900:
   a.update(priority=900,importanceClass='primary',priorityReason='authored-major')
 required=[a for a in labels if a.get('requiredProfiles')]
 for name in spec.required_names:
  if any(a['text']==name for a in required):continue
  candidates=[a for a in labels if a['text']==name]
  if candidates:required.append(min(candidates,key=lambda a:a['id']))
 for a in required:a.update(priority=1000,importanceClass='primary',priorityReason='required-destination')

@lru_cache(maxsize=1)
def distance_font():
 # The installed l-trail face. Font advance is only a generation-time lower
 # bound; browser geometry remains authoritative for actual placement.
 return ImageFont.truetype(str(Path(__file__).parents[1]/'labels/fonts/32e0ed70107262f4.ttf'),1000)

def source_peak_elevation(f):
 if f.get('provider')!='osm' and not f['id'].startswith('osm:'):return None
 raw=f.get('tags',{}).get('ele')
 try:value=float(raw)
 except (ValueError,TypeError):return None
 if not math.isfinite(value):return None
 return {'valueMeters':value,'sourceId':f['id'],'provider':'osm','sourceField':'ele','sourceValue':raw,'sourceUnit':'m','displayUnit':'ft','method':'source-tag:ele','verticalDatum':'unknown'}

def render_scene(features,routes,spec,M,existing=(),distances=()):
 groups={k:[] for k in ('defs','landcover','boundaries','buildings','hydro','roads','trails','hits','hydro-labels','boundary-labels','peaks','trail-labels','symbols','labels')}
 geod=Geod(ellps='WGS84')
 water_mask=unary_union([Polygon(p.exterior) for f in features if f['kind']=='waterbody' for p in parts(map_geometry(f,spec),'Polygon')])
 selected=Counter();omitted=[];styles={};route_by_id={r['id']:r for r in routes}
 def annotate(f,text,cls,xy,geometry_id=None,max_mpp=None,importance=None,secondary=None):
  if not text or text.strip().lower() in ('?','unknown','unnamed'):return
  x,y=xy
  if geometry_id:
   raw=f'<text class="{cls}" dy="-4"><textPath href="#{geometry_id}" startOffset="50%" text-anchor="middle">{escape(text)}</textPath></text>'
  else:
   sub=f'<tspan class="l-sub" x="0" dy="14">{escape(secondary)}</tspan>' if secondary else ''
   raw=f'<text class="{cls}" x="0" y="0" style="transform:translate({x:.3f}px,{y:.3f}px) scale(var(--k)) translate(8px,-6px)">{escape(text)}{sub}</text>'
  out=M.label(raw,text,cls,xy,kind='line-label' if geometry_id else 'point-label',geometry_id=geometry_id,source_id=f['id'])
  a=M.annotations[-1];a.update(sourceId=f['id'],maxMetersPerPixel=max_mpp)
  # A route-reference label shares the source feature without renaming the
  # directory destination that its physical road name already established.
  if cls=='l-road-ref' and f.get('name'):M.features[a['featureId']]['name']=f['name']
  if importance:a.update(importance)
  if cls in ('l-hydro','l-river'):a['layer']='water';a['priority']=850 if cls=='l-river' else 520
  return out
 def line_labels(f,line,cls,layer,max_mpp,text=None):
  name=text or f.get('name')
  if not name:return
  # Overlapping geographic windows survive deep-zoom viewport changes. Spacing is
  # enforced by the solver in CSS pixels; windows never move the physical path.
  step=80;count=max(1,math.ceil(line.length/step))
  for i in range(count):
   center=min(line.length,(i+.5)*line.length/count);seg=substring(line,max(0,center-80),min(line.length,center+80))
   if seg.geom_type!='LineString' or seg.length<2:continue
   gid=stable_id('label-geometry',[f['id'],name,list(seg.coords)])
   groups['defs'].append(f'<path id="{gid}" d="{detail_path(list(seg.coords),.025)}"/>')
   xy=list(line.interpolate(center).coords)[0]
   raw=annotate(f,name,cls,xy,gid,max_mpp)
   if raw:
    M.annotations[-1]['geometryBounds']=list(seg.bounds)
    M.annotations[-1]['featureLengthMeters']=line.length*spec.meters_per_map_unit
    groups[layer].append(raw)
 def render_poi(f,g):
  p=g if g.geom_type=='Point' else g.representative_point();xy=(p.x,p.y);t=f.get('tags',{});st=poi_style(t);name=f.get('name');fc=f.get('properties',{}).get('featureClass');importance=poi_importance(t,fc)
  # Do not add a second symbol for the same editorial/source feature, but keep
  # separate nearby facilities. This is an omission reason, not a catalog merge.
  duplicate=next((e for e in existing if e.get('sourceId') is not None and (e['sourceId']==f['id'] or isinstance(e['sourceId'],int) and f['id']=='osm:node:'+str(e['sourceId']))),None)
  if duplicate:omitted.append({'id':f['id'],'role':'poi','reason':'existing-source-identity','existingId':duplicate['id']});return
  if not name and st['symbol']=='point':omitted.append({'id':f['id'],'role':'poi','reason':'unclassified-unnamed-point'});return
  if fc in ('Stream','Valley','Ridge','Range','Cliff','Basin','Bench','Pillar','Summit','Lake','Reservoir','Flat','Plain','Slope','Woods'):
   st={**st,'symbol':'peak' if fc=='Summit' else 'point','maxMetersPerPixel':32}
  if importance['priorityReason']=='settlement':st={**st,'maxMetersPerPixel':64}
  if st['symbol']!='point':
   raw=f'<g style="transform:translate({p.x:.3f}px,{p.y:.3f}px) scale(var(--k))">{symbol_svg(st["symbol"])}</g>'
   groups['peaks' if st['symbol']=='peak' else 'symbols'].append(M.symbol(raw,st['symbol'],xy,source_id=f['id']));M.annotations[-1].update(sourceId=f['id'],maxMetersPerPixel=st['maxMetersPerPixel'],**{**importance,'priority':importance['priority']+10})
  if st['symbol'] in SYMBOL_ONLY_SERVICES:
   fid=M._feature(xy,name or '',st['symbol'],directory=bool(name),source_id=f['id'])
   M.features[fid]['mapLabelPolicy']='symbol-only-service'
   if name:omitted.append({'id':f['id'],'role':'poi-label','reason':'symbol-only-service-label','symbolKind':st['symbol']})
   selected['poi']+=1
   return
  elevation=source_peak_elevation(f) if st['symbol']=='peak' else None
  raw=annotate(f,name,'l-peak' if st['symbol']=='peak' else 'l-settlement' if importance['priorityReason']=='settlement' else 'l-minor' if fc else 'l-place',xy,max_mpp=st['maxMetersPerPixel'],importance=importance,secondary=f'{elevation["valueMeters"]/.3048:,.0f} ft' if elevation else None)
  if raw and elevation:M.annotations[-1]['elevation']=elevation
  if raw:groups['peaks' if st['symbol']=='peak' else 'labels'].append(raw)
  selected['poi']+=1
 for f in sorted(features,key=lambda x:x['id']):
  kind=f['kind'];g=map_geometry(f,spec)
  if g.is_empty:omitted.append({'id':f['id'],'reason':'outside-frame'});continue
  common=f' data-source-id="{escape(f["id"])}"'
  if kind in ('trail','road'):
   st=transport_style(f.get('tags',{}));styles[str((st['kind'],st['class'],st['surface'],st['color'],st['status']))]=st
   color=PALETTE[st['color']];dash=','.join(f'calc({n}px * var(--s))' for n in st['dash']) or 'none';limit=st['maxMetersPerPixel']
   name=f.get('name') or next((route_by_id[r]['name'] for r in f.get('routeIds',[]) if r in route_by_id and route_by_id[r].get('name')),None)
   named={**f,'name':name};tags=f.get('tags',{})
   refs=sorted({ref for ref in [tags.get('ref'),*[route_by_id[r].get('tags',{}).get('ref') for r in f.get('routeIds',[]) if r in route_by_id]] if ref})
   info=[f'surface: {tags.get("surface","unknown")}']
   if kind=='trail':info.append(f'SAC difficulty: {st["difficulty"] or "unknown"}')
   for label,value in [('visibility',st['visibility']),('access',st['access']),('status',st['status']),('track grade',st['trackGrade']),('smoothness',st['smoothness'])]:
    if value:info.append(f'{label}: {value}')
   if refs:info.append('route ref: '+', '.join(refs))
   info=' · '.join(info)
   for line in parts(g,'LineString'):
    latitudes,longitudes=zip(*(spec.unproject(x,y) for x,y in line.coords));length_miles=geod.line_length(longitudes,latitudes)/1609.344
    anchor=line.interpolate(.5,normalized=True)
    d=detail_path(list(line.coords),.025);fid=M._feature((anchor.x,anchor.y),name or '',kind,source_id=f['id'])
    attrs=common+f' data-route-ids="{escape(json.dumps(sorted(set(f.get("routeIds",[])))))}" data-name="{escape(name or st["class"])}" data-cls="{st["class"]}" data-mi="{length_miles:.4f}" data-info="{escape(info)}" data-max-mpp="{limit}" data-feature-id="{fid}"'
    base=f'fill:none;stroke-linejoin:round;stroke-linecap:round;stroke-width:calc({st["width"]}px * var(--s));stroke:{color};stroke-dasharray:{dash}'
    if f.get('tags',{}).get('tunnel') not in (None,'no'):base+=';opacity:.6'
    if f.get('tags',{}).get('bridge') not in (None,'no'):
     groups['trails' if kind=='trail' else 'roads'].append(f'<path class="bridge-case" d="{d}"{attrs} style="fill:none;stroke:var(--ink);stroke-width:calc({st["width"]+1.8}px * var(--s))"/>')
    if kind=='road':groups['roads'].append(f'<path class="transport-case" d="{d}"{attrs} style="fill:none;stroke:var(--road-case);stroke-width:calc({st["caseWidth"]}px * var(--s))"/>')
    groups['trails' if kind=='trail' else 'roads'].append(f'<path class="tr transport {kind}" d="{d}"{attrs} style="{base}"/>')
    if kind=='trail' and M.mode!='static':groups['hits'].append(f'<path class="hit" d="{d}"{attrs}/>')
    line_labels(named,line,'l-trail' if kind=='trail' else 'l-road-major' if st['importance']>=4 else 'l-road','trail-labels',limit)
    ref=f.get('tags',{}).get('ref') or next((route_by_id[r]['tags'].get('ref') for r in f.get('routeIds',[]) if r in route_by_id and route_by_id[r]['tags'].get('ref')),None)
    shown_ref=visible_reference(kind,name,ref)
    if shown_ref:line_labels(named,line,'l-road-ref','trail-labels',limit,text=shown_ref)
   selected[kind]+=1
  elif kind=='barrier':
   tag=f.get('tags',{}).get('barrier','unknown');lines=list(parts(g,'LineString'))
   if not lines:omitted.append({'id':f['id'],'reason':'barrier-without-line-geometry'});continue
   for line in lines:
    dash='none' if tag in ('wall','retaining_wall','city_wall') else 'calc(2px * var(--s)),calc(2px * var(--s))'
    groups['roads'].append(f'<path class="barrier-line" d="{detail_path(list(line.coords),.025)}"{common} data-barrier-type="{escape(tag)}" data-max-mpp="6" style="fill:none;stroke:var(--ink);stroke-width:calc(.65px * var(--s));stroke-dasharray:{dash};opacity:.65"/>')
   selected[kind]+=1
  elif kind=='railway':
   tags=f.get('tags',{});railway=tags.get('railway','unknown')
   lifecycle=('razed','abandoned','disused','construction','proposed')
   status=next((value for value in lifecycle if railway==value or tags.get(value)=='yes' or tags.get(value+':railway') not in (None,'no')), 'unknown')
   rail_type=(tags.get(status+':railway') or tags.get(status)) if railway in lifecycle else railway
   if rail_type in (None,'yes','no'):rail_type='unknown'
   # Physical rail mapping is not evidence of current operation. Unknown remains
   # explicit; lifecycle-tagged alignments use a subdued broken centerline.
   info=' · '.join(f'{key}: {value}' for key,value in [('railway',rail_type),('status',status),*[(key,tags.get(key,'unknown')) for key in ('usage','service','electrified','gauge','access')]])
   limit=12 if tags.get('service') in ('yard','siding','spur') else 64
   lines=list(parts(g,'LineString'))
   if not lines:omitted.append({'id':f['id'],'reason':'railway-without-line-geometry'});continue
   for line in lines:
    d=detail_path(list(line.coords),.025);anchor=line.interpolate(.5,normalized=True)
    fid=M._feature((anchor.x,anchor.y),f.get('name') or '',kind,source_id=f['id'])
    attrs=common+f' data-feature-id="{fid}" data-name="{escape(f.get("name") or "Railway")}" data-railway-type="{escape(rail_type)}" data-status="{status}" data-info="{escape(info)}" data-max-mpp="{limit}"'
    base='fill:none;stroke:var(--ink);stroke-linejoin:round;stroke-linecap:butt'
    if status!='unknown':base+=';opacity:.5'
    core=base+';stroke-width:calc(.8px * var(--s))'
    if status!='unknown':core+=';stroke-dasharray:calc(3px * var(--s)),calc(4px * var(--s))'
    ties=base+';stroke-width:calc(3.6px * var(--s));stroke-dasharray:calc(1px * var(--s)),calc(6px * var(--s))'
    groups['roads'].append(f'<path class="railway-core" d="{d}"{attrs} style="{core}"/>')
    # Proposed and razed alignments have no claim of physical track remaining.
    if status not in ('proposed','razed'):groups['roads'].append(f'<path class="railway-ties" d="{d}"{attrs} style="{ties}"/>')
    line_labels(f,line,'l-road','trail-labels',min(limit,32))
   selected[kind]+=1
  elif kind=='waterway':
   st=hydro_style(f)
   for line in parts(g,'LineString'):
    dash=','.join(f'calc({n}px * var(--s))' for n in st['dash']) or 'none'
    for painted_line in parts(line.difference(water_mask),'LineString'):
     groups['hydro'].append(f'<path class="water-line {st["class"]}" d="{detail_path(list(painted_line.coords),.025)}"{common} data-flow="{st["flowStatus"]}" style="fill:none;stroke:var(--creek);stroke-width:calc({st["width"]}px * var(--s));stroke-dasharray:{dash}"/>')
    line_labels(f,line,'l-river' if st['class']=='river' else 'l-hydro','hydro-labels',64)
   selected[kind]+=1
  elif kind in ('waterbody','boundary','building','landcover'):
   if kind=='landcover':continue # categorical raster owns paint, source remains cataloged
   d=polygon_path(g)
   if not d:omitted.append({'id':f['id'],'reason':'no-polygon'});continue
   if kind=='waterbody':layer='hydro';style='fill:var(--water-fill);stroke:var(--creek);stroke-width:calc(.35px * var(--s))'
   elif kind=='building':layer='buildings';style='fill:var(--building-fill);stroke:var(--building-edge);stroke-width:calc(.15px * var(--s))'
   else:layer='boundaries';style='fill:none;stroke:var(--boundary-ink);stroke-width:calc(.95px * var(--s));stroke-linejoin:round;stroke-dasharray:calc(8px * var(--s)),calc(3px * var(--s)),calc(2px * var(--s)),calc(3px * var(--s))'
   attrs=' data-max-mpp="8"' if kind=='building' else ''
   groups[layer].append(f'<path class="area-{kind}" d="{d}"{common}{attrs} fill-rule="evenodd" style="{style}"/>')
   if f.get('name') and kind!='building':
    p=g.representative_point();raw=annotate(f,f['name'],'l-hydro' if kind=='waterbody' else 'l-region-s',(p.x,p.y),max_mpp=32 if kind=='waterbody' else 64)
    if raw:
     M.annotations[-1]['areaPolygons']=[[list(poly.exterior.coords),*[list(r.coords) for r in poly.interiors]] for poly in parts(g,'Polygon')]
     M.annotations[-1]['layer']='water' if kind=='waterbody' else 'boundaries'
     groups['hydro-labels' if kind=='waterbody' else 'boundary-labels'].append(raw)
   selected[kind]+=1
   if kind=='building' and 'poi' in feature_roles(f.get('tags',{}),kind):render_poi(f,g)
  elif kind=='poi':render_poi(f,g)
  else:omitted.append({'id':f['id'],'reason':'unsupported-kind:'+kind})
 distance_omissions=[];distance_count=0
 for segment in sorted(distances,key=lambda d:d['id']):
  g=map_geometry(segment,spec);lines=list(parts(g,'LineString'))
  if not lines:distance_omissions.append({'id':segment['id'],'sourceId':segment['sourceId'],'reason':'outside-frame'});continue
  line=max(lines,key=lambda g:g.length);text=f'{segment["meters"]/1609.344:.2f} mi / {segment["meters"]/1000:.2f} km'
  # At the supported 14x maximum, a path shorter than the actual font advance
  # cannot fit even before curvature, controls or competing names are considered.
  # Keep its full graph/table record, but do not embed an impossible annotation.
  max_zoom=14 if M.mode=='interactive' else 1;font_size=14 if M.mode=='interactive' else 10.5
  minimum_width=distance_font().getlength(text)*font_size/1000+4
  if line.length*max_zoom<minimum_width:
   distance_omissions.append({'id':segment['id'],'sourceId':segment['sourceId'],'reason':'distance-window-too-short-at-supported-scale','maxZoom':max_zoom,'minimumTextWidthPixels':round(minimum_width,2),'availablePathPixels':round(line.length*max_zoom,2)});continue
  gid=stable_id('distance-geometry',[segment['id'],list(line.coords)])
  groups['defs'].append(f'<path id="{gid}" d="{detail_path(list(line.coords),.025)}"/>')
  xy=list(line.interpolate(.5,normalized=True).coords)[0]
  # Original physical source identity preserves association with protected trails;
  # the repeat identity is the unique junction segment, never its display length.
  owner={**segment,'id':segment['sourceId']};fid=M._feature(xy,segment.get('name') or '',kind='trail',source_id=segment['sourceId']);before_name=M.features[fid]['name']
  raw=annotate(owner,text,'l-trail',xy,gid,min(6,line.length*spec.meters_per_map_unit/minimum_width) if M.mode=='interactive' else None)
  a=M.annotations[-1];a.update(priority=200,repeatGroup=segment['id'],distanceSegmentId=segment['id'],distanceMeters=segment['meters'],distanceMethod=segment['method'],distanceUnits=['mi','km'],fromNode=segment['fromNode'],toNode=segment['toNode'],geometryBounds=list(line.bounds),maxInstances=1)
  M.features[a['featureId']]['name']=before_name
  groups['trail-labels'].append(raw);distance_count+=1
 apply_point_importance(M,spec)
 display_matches=match_display_repeats(M,features,spec)
 text_selection=apply_text_importance(M,features)
 result={k:('<defs>'+''.join(v)+'</defs>' if k=='defs' else f'<g class="{k}">'+''.join(v)+'</g>') for k,v in groups.items()}
 return result,{'textSelection':text_selection,'displayRepeatMatches':display_matches,'selected':dict(selected),'omitted':omitted,'styles':list(styles.values()),'facilitySymbols':dict(Counter(a['symbolKind'] for a in M.annotations if a['kind']=='symbol')),'distanceLabels':{'generated':distance_count,'omitted':distance_omissions,'method':'Font advance lower bound at native sheet width; supported maximum 14x interactive or 1x static; final browser placement remains authoritative'}}

def augment_svg(svg,M,spec,catalog):
 root=ET.fromstring(svg);replace={'hydro','roads','trails','hits','hydro-labels','trail-labels'};discard=set()
 for e in list(root):
  if set(e.get('class','').split())&replace:
   discard.update(c.get('data-layout-id') for c in e.iter() if c.get('data-layout-id'));root.remove(e)
 M.annotations=[a for a in M.annotations if a['id'] not in discard];M.ids-=discard
 groups,report=render_scene(catalog['features'],catalog.get('routes',[]),spec,M,existing=list(M.features.values()),distances=catalog.get('distances',()))
 for k,raw in groups.items():
  e=ET.fromstring(raw)
  for c in e.iter():c.tag='{'+NS+'}'+c.tag
  if k=='defs':
   defs=root.find('{'+NS+'}defs')
   if defs is None:root.insert(0,e)
   else:defs.extend(e)
  elif k in ('labels','symbols'):
   old=next((n for n in root if n.get('class')==k),None)
   if old is not None:old.extend(e)
   else:root.append(e)
  else:root.append(e)
 order=['defs','terrain','landcover','contours','contour-labels','boundaries','buildings','hydro','roads','trails','hits','regions','hydro-labels','boundary-labels','peaks','symbols','trail-labels','labels','fixed-ui','cartouche','scale','neatline']
 def rank(e):
  if e.tag.endswith('defs'):return 0
  return next((i for i,k in enumerate(order) if k in e.get('class','').split()),len(order))
 root[:]=sorted(root,key=rank)
 M.map_metadata={'frame':spec.frame,'metersPerMapUnit':spec.meters_per_map_unit,'requiredRoutes':list(spec.required_routes),'region':spec.id,'contourIntervalsFeet':list(spec.contour_intervals)}
 return ET.tostring(root,encoding='unicode'),report
