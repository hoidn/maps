"""Stable annotation identities, semantic relationships and inert HTML manifests.

No text metrics or placement algorithm lives in Python. Geographic anchors and the
existing preferred SVG positions are preserved for the browser layout adapter.
"""
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
    return json.dumps(value, ensure_ascii=False, allow_nan=False, separators=(',', ':')).replace('<', '\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')

class Manifest:
    def __init__(self, mode='interactive', width=1300, height=1070):
        self.mode, self.width, self.height = mode, width, height
        self.features = {}
        self.annotations = []
        self.ids = set()

    def _anchor(self, xy):
        if len(xy) != 2 or not all(math.isfinite(v) for v in xy):
            raise ValueError('Annotation anchor must contain two finite coordinates')
        return [round(float(v), 1) for v in xy]

    def _feature(self, xy, name='', kind='place', directory=False, source_id=None):
        xy = self._anchor(xy)
        fid = stable_id('feature', [kind if kind in ('trail','region','contour','waterway') else 'place', name if kind in ('trail','region','contour','waterway') else (['source',source_id] if source_id is not None else xy)])
        current = self.features.setdefault(fid, dict(id=fid, name=name, kind=kind, anchor=xy, directory=directory))
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
        layer = 'peaks' if cls=='l-peak' else ('contours' if feature_kind=='contour' else ('names' if kind in ('line-label','region-label') else 'places'))
        directory = feature_kind=='place' and kind!='edge-pointer'
        fid=self._feature(xy,text,feature_kind,directory,source_id)
        identity=[text,cls,xy,geometry_id,source_id,raw if geometry_id else '']
        aid=stable_id('label', identity)
        record=dict(id=aid,elementId=aid,featureId=fid,kind=kind,layer=layer,anchor=xy,text=text,
                    style=cls,priority=PRIORITIES.get(cls,500),requiredProfiles=['static-default'] if text in REQUIRED else [],
                    angle=angle,geometryId=geometry_id,requiredGroup=text if text in REQUIRED_ROUTES else None)
        if kind=='point-label' and len(text.split())>1:
            words=text.split();mid=min(range(1,len(words)),key=lambda i:abs(len(' '.join(words[:i]))-len(' '.join(words[i:]))))
            splits=[mid]+[i for i in range(1,len(words)) if i!=mid]
            record['variants']=[dict(lines=[' '.join(words[:i]),' '.join(words[i:])]) for i in splits]
            if text in REQUIRED:
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
        return self._wrap(raw,record)

    def finalize(self, svg):
        root=ET.fromstring(svg); root.set('id','mapsvg')
        # Normalize historical hN/cN references before deriving annotation identities.
        remap={}
        for defs in root.findall(f'{{{NS}}}defs'):
            for path in defs.iter(f'{{{NS}}}path'):
                if path.get('id'):
                    old=path.get('id'); new=stable_id('geometry',path.get('d',''))
                    remap[old]=new; path.set('id',new)
        for e in root.iter():
            href=e.get('href','')
            if href.startswith('#') and href[1:] in remap: e.set('href','#'+remap[href[1:]])
        parent={c:p for p in root.iter() for c in p}
        for element in list(root.iter(f'{{{NS}}}text')):
            chain=[]; p=element
            while p in parent:
                p=parent[p]; chain.append(p)
            if any(p.get('data-layout-id') for p in chain): continue
            if any(set(p.get('class','').split()) & {'fixed-ui','cartouche','scale'} for p in chain): continue
            cls=element.get('class','')
            text=''.join(element.itertext())
            path=element.find(f'{{{NS}}}textPath')
            geometry_id=path.get('href','').lstrip('#') if path is not None else None
            if geometry_id:
                target=next((e for e in root.iter() if e.get('id')==geometry_id),None)
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
                path.set('id',stable_id('trail-path',path.get('d','')))
                path.set('data-layout-obstacle','trail')
                name=path.get('data-name','')
                if name:
                    fid=self._feature((0,0),name,'trail')
                    path.set('data-feature-id',fid)
        paths_by_feature={}
        for path in root.iter(f'{{{NS}}}path'):
            if path.get('data-layout-obstacle')=='trail':
                paths_by_feature.setdefault(path.get('data-feature-id'),[]).append(path.get('id'))
        for a in self.annotations:
            if a['kind']=='line-label' and not a.get('geometryId'):
                a['geometryIds']=paths_by_feature.get(a['featureId'],[])
        return ET.tostring(root,encoding='unicode')

    def data(self):
        return dict(version=1,map=dict(width=self.width,height=self.height,mode=self.mode,coordinateSpace='svg'),
                    features=list(self.features.values()),annotations=self.annotations)

    def json(self): return safe_json(self.data())

    def script(self):
        return '<script type="application/json" id="map-label-manifest">'+self.json()+'</script>'

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
