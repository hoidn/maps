"""Stable annotation identities, semantic relationships and inert HTML manifests.

No text metrics or placement algorithm lives in Python. Geographic anchors and the
existing preferred SVG positions are preserved for the browser layout adapter.
"""
from fractions import Fraction
import unicodedata
import hashlib
import html
import json
import math
import re
import xml.etree.ElementTree as ET

NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)
REQUIRED = {'Bright Angel TH', 'South Kaibab TH', 'North Kaibab TH',
            '1½ Mile Resthouse', '3 Mile Resthouse', 'Havasupai Gardens',
            'Bright Angel CG', 'Cottonwood CG', 'Phantom Ranch'}
REQUIRED_ROUTES = {'Bright Angel Trail', 'South Kaibab Trail', 'North Kaibab Trail'}
PRIORITIES = {'l-major':900, 'l-place':800, 'l-trail-c':780, 'l-trail-cs':780,
              'l-trail':650, 'l-trail-r':600, 'l-minor':550, 'l-peak':400,
              'l-region':300, 'l-region-s':300, 'l-village':700, 'l-river':250,
              'l-hydro':220, 'l-contour':100, 'l-contour-f':90, 'l-contour-ff':80}

def stable_id(prefix, value):
    return prefix + '-' + hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]

def safe_json(value):
    text=json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')).replace('<', '\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
    return re.sub(r'[\ud800-\udfff]',lambda m:f'\\u{ord(m[0]):04x}',text)

def json_script(identity, value):
    """Bound HTML raw-text nodes while retaining the exact ID.textContent JSON."""
    payload=safe_json(value).encode('utf8');identity=html.escape(identity,quote=True);limit=65536
    if len(payload)<=limit:
        return f'<script type="application/json" id="{identity}">'+payload.decode('utf8')+'</script>'
    parts=[f'<div hidden data-json-chunks id="{identity}">'];start=0
    while start<len(payload):
        end=min(start+limit,len(payload))
        while end<len(payload) and payload[end]&0xc0==0x80:end-=1
        parts.extend(('<script type="application/json">',payload[start:end].decode('utf8'),'</script>'));start=end
    parts.append('</div>')
    return ''.join(parts)

VULGAR_FRACTIONS = '¼½¾⅐⅑⅒⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞'

def point_display_name(text):
    """Normalize numerical spellings for repetition, without asserting identity.

    Preserve every nonnumeric character and the existing case/whitespace rule.
    Source names, geographic anchors and feature IDs never use this key.
    """
    def mixed(match):
        fraction=Fraction(unicodedata.normalize('NFKC',match[2]).replace('⁄','/'))
        return str(Fraction(match[1] or '0')+fraction)
    text=re.sub(r'(\d*)(['+VULGAR_FRACTIONS+'])',mixed,text)
    def number(match):
        try:return str(Fraction(match[0]))
        except (ValueError,ZeroDivisionError):return match[0]
    text=re.sub(r'(?<![\w.])(?:\d+\.\d+|\.\d+|\d+(?:/\d+)?)(?![\w.])',number,text)
    return ' '.join(text.casefold().split())

class Manifest:
    def __init__(self, mode='interactive', width=1300, height=1070):
        self.mode, self.width, self.height = mode, width, height
        self.required=set(REQUIRED);self.required_routes=set(REQUIRED_ROUTES)
        self.features = {}
        self.annotations = []
        self.ids = set()

    def _anchor(self, xy):
        if len(xy) != 2 or not all(math.isfinite(v) for v in xy):
            raise ValueError('Annotation anchor must contain two finite coordinates')
        return [round(float(v), 1) for v in xy]

    def _feature(self, xy, name='', kind='place', directory=False, source_id=None):
        xy = self._anchor(xy)
        fid = stable_id('feature', [kind if kind in ('trail','region','contour','waterway') else 'place', ['source',source_id] if source_id is not None else name if kind in ('trail','region','contour','waterway') else xy])
        current = self.features.setdefault(fid, dict(id=fid, name=name, kind=kind, anchor=xy, directory=directory,sourceId=source_id))
        if name and (not current['name'] or directory): current['name'] = name
        current['directory'] = current['directory'] or directory
        return fid

    def _wrap(self, raw, record):
        if record['id'] in self.ids: raise ValueError('Duplicate annotation: ' + record['id'])
        self.ids.add(record['id']); self.annotations.append(record)
        return f'<g id="{record["id"]}" data-layout-id="{record["id"]}" data-feature-id="{record["featureId"]}">{raw}</g>'

    def label(self, raw, text, cls, xy, kind='point-label', geometry_id=None, angle=0, source_id=None):
        xy=self._anchor(xy)
        if any(arrow in text for arrow in ('→','↗','←','↖')): kind='edge-pointer'
        if cls.startswith('l-region') or cls=='l-village': kind='region-label'
        feature_kind = 'region' if kind=='region-label' else ('trail' if cls.startswith('l-trail') else 'place')
        if cls.startswith('l-contour'): feature_kind='contour'
        if cls in ('l-river','l-hydro'): feature_kind='waterway'
        layer = 'water' if cls in ('l-river','l-hydro') else 'peaks' if cls=='l-peak' else ('contours' if feature_kind=='contour' else ('names' if kind in ('line-label','region-label') else 'places'))
        directory = feature_kind=='place' and kind!='edge-pointer'
        fid=self._feature(xy,text,feature_kind,directory,source_id)
        identity=[text,cls,xy,geometry_id,source_id,raw if geometry_id else '']
        aid=stable_id('label', identity)
        record=dict(id=aid,elementId=aid,featureId=fid,kind=kind,layer=layer,anchor=xy,text=text,
                    style=cls,priority=PRIORITIES.get(cls,500),requiredProfiles=['static-default'] if text in self.required and not any(a.get('text')==text and a.get('requiredProfiles') for a in self.annotations) else [],
                    angle=angle,geometryId=geometry_id,repeatGroup=stable_id('display-name',[feature_kind,point_display_name(text) if kind=='point-label' else ' '.join(text.casefold().split())]),repeatDistance=180,requiredGroup=text if text in self.required_routes else None)
        if (kind=='point-label' or self.mode=='static' and kind=='line-label' and text in self.required_routes) and len(text.split())>1:
            words=text.split();mid=min(range(1,len(words)),key=lambda i:abs(len(' '.join(words[:i]))-len(' '.join(words[i:]))))
            splits=[mid]+[i for i in range(1,len(words)) if i!=mid]
            record['variants']=[dict(lines=[' '.join(words[:i]),' '.join(words[i:])]) for i in splits]
            if kind=='point-label' or text in self.required or text in self.required_routes:
                record['variants'] += [dict(lines=[' '.join(words[:i]),' '.join(words[i:j]),' '.join(words[j:])]) for i in range(1,len(words)-1) for j in range(i+1,len(words))]
        return self._wrap(raw, record)

    def symbol(self, raw, kind, xy, offset=(0,0), source_id=None):
        xy=self._anchor(xy)
        fid=self._feature(xy,kind=kind,source_id=source_id)
        aid=stable_id('symbol',[kind,xy,list(offset),source_id])
        record=dict(id=aid,elementId=aid,featureId=fid,kind='symbol',symbolKind=kind,
                    layer='peaks' if kind=='peak' else 'places',anchor=xy,text='',style=kind,
                    priority=810 if kind in ('th','camp','water','shelter','lodge') else 450,
                    requiredProfiles=[],offset=list(offset))
        if kind=='peak':record.update(priority=860,importanceClass='primary',priorityReason='summit-symbol')
        return self._wrap(raw,record)

    def finalize(self, svg):
        root=ET.fromstring(svg); root.set('id','mapsvg'); root.set('data-layout-pending','')
        metadata=getattr(self,'map_metadata',{})
        if self.mode=='static' and metadata.get('metersPerMapUnit'):
            scale=1;profile=getattr(self,'print_profile',None)
            if profile:
                width=profile['mapWidthMm']
                if width is None:width=profile['paperMm'][0]-2*(profile['marginMm']+profile.get('tickMarginMm',0))
                # The collar can only reduce this width. One CSS pixel allows
                # browser dimension rounding while conservatively retaining detail.
                scale=(width*96/25.4+1)/self.width
            minimum_mpp=metadata['metersPerMapUnit']/scale
            removed={a['id'] for a in self.annotations if not a.get('requiredProfiles') and not a.get('requiredGroup')
                     and any(isinstance(a.get(key),(int,float)) and 0<a[key]<minimum_mpp for key in ('maxMetersPerPixel','textMaxMetersPerPixel'))}
            self.annotations=[a for a in self.annotations if a['id'] not in removed];self.ids-=removed
            geometry_count=0
            for parent in root.iter():
                keep=[]
                for child in parent:
                    limit=float(child.get('data-max-mpp','0'))
                    if child.get('data-layout-id') in removed:continue
                    if 0<limit<minimum_mpp:geometry_count+=1;continue
                    keep.append(child)
                parent[:]=keep
            metadata['staticPreparation']={'minimumMetersPerPixel':minimum_mpp,'removedGeometryElements':geometry_count,'removedOptionalAnnotations':len(removed)}
        # Normalize historical hN/cN references before deriving annotation identities.
        remap={}
        for defs in root.findall(f'{{{NS}}}defs'):
            for path in defs.iter(f'{{{NS}}}path'):
                if path.get('id'):
                    old=path.get('id'); new=stable_id('geometry',path.get('d',''))
                    remap[old]=new; path.set('id',new)
        # Identical label geometry is shared after content-addressing; never emit
        # duplicate DOM IDs when refs/names use the same physical window.
        seen_geometry=set()
        for defs in root.findall(f'{{{NS}}}defs'):
            for path in list(defs):
                gid=path.get('id')
                if gid and gid in seen_geometry:defs.remove(path)
                elif gid:seen_geometry.add(gid)
        by_id={}
        for e in root.iter():
            href=e.get('href','')
            if href.startswith('#') and href[1:] in remap: e.set('href','#'+remap[href[1:]])
            if e.get('id'): by_id.setdefault(e.get('id'),e)
        parent={c:p for p in root.iter() for c in p}
        for element in list(root.iter(f'{{{NS}}}text')):
            chain=[]; p=element
            while p in parent:
                p=parent[p]; chain.append(p)
            if any(p.get('data-layout-id') for p in chain): continue
            if any(set(p.get('class','').split()) & {'fixed-ui','cartouche','scale','coordinate-grid'} for p in chain): continue
            cls=element.get('class','')
            text=''.join(element.itertext())
            path=element.find(f'{{{NS}}}textPath')
            geometry_id=path.get('href','').lstrip('#') if path is not None else None
            if geometry_id:
                target=by_id.get(geometry_id)
                if target is None: raise ValueError('Unknown text path: '+geometry_id)
                nums=re.findall(r'-?\d+(?:\.\d+)?',target.get('d',''))
                xy=tuple(map(float,nums[:2])) if len(nums)>=2 else (0,0)
            else: xy=(float(element.get('x',0)),float(element.get('y',0)))
            raw=ET.tostring(element,encoding='unicode')
            wrapped=self.label(raw,text,cls,xy,'line-label' if path is not None else 'point-label',geometry_id)
            wrapper=ET.fromstring(wrapped)
            # Convert wrapper into the SVG namespace; children already carry it.
            wrapper.tag=f'{{{NS}}}g'
            p=parent[element]; index=list(p).index(element); p.remove(element); p.insert(index,wrapper)
        for group in root.iter(f'{{{NS}}}g'):
            if 'trails' not in group.get('class','').split(): continue
            for path in group.iter(f'{{{NS}}}path'):
                casing='bridge-case' in path.get('class','').split()
                path.set('id',stable_id('trail-case' if casing else 'trail-path',[path.get('d',''),path.get('data-source-id','')] if casing else path.get('d','')))
                path.set('data-layout-obstacle','trail')
                name=path.get('data-name','')
                if name and not path.get('data-feature-id'):
                    fid=self._feature((0,0),name,'trail')
                    path.set('data-feature-id',fid)
        # Wrapping labels and identifying trails changed IDs; rebuild the same
        # first-match index before resolving remaining geometry bounds.
        paths_by_feature={};by_id={}
        for path in root.iter():
            if path.get('id'): by_id.setdefault(path.get('id'),path)
            if path.tag==f'{{{NS}}}path' and path.get('data-layout-obstacle')=='trail':
                paths_by_feature.setdefault(path.get('data-feature-id'),[]).append(path.get('id'))
        for a in self.annotations:
            if a.get('geometryId') in remap: a['geometryId']=remap[a['geometryId']]
            if a.get('geometryId') and not a.get('geometryBounds'):
                target=by_id.get(a['geometryId'])
                if target is not None:
                    values=list(map(float,re.findall(r'-?\d+(?:\.\d+)?',target.get('d',''))))
                    if len(values)>=4 and len(values)%2==0:a['geometryBounds']=[min(values[::2]),min(values[1::2]),max(values[::2]),max(values[1::2])]

            if a['kind']=='line-label' and not a.get('geometryId'):
                a['geometryIds']=paths_by_feature.get(a['featureId'],[])
        if self.mode=='static':
            # Scale preparation can discard thousands of labels while leaving
            # their private path definitions behind. Retain every live reference.
            referenced=set()
            for element in root.iter():
                for key,value in element.attrib.items():
                    if key in ('href','{http://www.w3.org/1999/xlink}href') and value.startswith('#'):
                        referenced.add(value[1:])
                    referenced.update(re.findall(r'''url\(\s*['"]?#([^\s)'";]+)''',value))
                if element.tag==f'{{{NS}}}style':
                    referenced.update(re.findall(r'''url\(\s*['"]?#([^\s)'";]+)''',''.join(element.itertext())))
            referenced={remap.get(ref,ref) for ref in referenced}
            for annotation in self.annotations:
                referenced.update(annotation.get('geometryIds',[]))
                if annotation.get('geometryId'):referenced.add(annotation['geometryId'])
            for defs in root.findall(f'{{{NS}}}defs'):
                defs[:]=[element for element in defs if element.tag!=f'{{{NS}}}path' or not element.get('id') or element.get('id') in referenced]
        return ET.tostring(root,encoding='unicode')

    def data(self):
        return dict(version=1,map=dict(width=self.width,height=self.height,mode=self.mode,coordinateSpace='svg',**getattr(self,'map_metadata',{}),**({'print':self.print_profile} if getattr(self,'print_profile',None) else {})),
                    features=list(self.features.values()),annotations=self.annotations)

    def json(self): return safe_json(self.data())

    def script(self):
        return json_script('map-label-manifest',self.data())

def embedded_fonts():
    """Return local hash-verified font faces as single-file CSS data URLs."""
    from pathlib import Path
    import base64
    directory=Path(__file__).parent/'labels'/'fonts'
    assets=json.loads((directory/'manifest.json').read_text())
    css=(directory/'fonts.css').read_text()
    for name, metadata in assets.items():
        content=(directory/name).read_bytes()
        if hashlib.sha256(content).hexdigest()!=metadata['sha256']:
            raise ValueError('Font hash mismatch: '+name)
        mime='font/woff2' if name.endswith('.woff2') else 'font/ttf'
        css=css.replace('url('+name+')','url(data:'+mime+';base64,'+base64.b64encode(content).decode()+')')
    if re.search(r'url\((?!data:)',css): raise ValueError('Non-embedded font URL')
    return css


def layout_script():
    from pathlib import Path
    bundle=Path(__file__).parent/'labels/dist/browser.js'
    if not bundle.exists():
        raise RuntimeError('Missing layout bundle. Run npm run build:labels at the repository root.')
    return '<script id="map-layout-runtime">'+bundle.read_text().replace('</script','<\\/script')+'</script>'
