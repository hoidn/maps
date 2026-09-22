"""Physical print requests and the shared SVG map collar. Geographic frames stay fixed."""
import math
import re
from pyproj import Geod

MAX_PAGE_MM = 2438.4
POINTS = {'place': 10, 'secondary': 8, 'trail': 9, 'region': 12, 'major': 12,
          'settlement': 12, 'road': 8, 'roadMajor': 9, 'roadRef': 9, 'contour': 7}


def parse_paper(value):
    match = re.fullmatch(r'(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(in|mm)', value)
    if not match:
        raise ValueError('Paper must be WIDTHxHEIGHTin or WIDTHxHEIGHTmm')
    factor = 25.4 if match[3] == 'in' else 1
    dimensions = [round(float(match[i]) * factor, 6) for i in (1, 2)]
    if not all(math.isfinite(v) and 100 <= v <= MAX_PAGE_MM for v in dimensions):
        raise ValueError('Paper dimensions must be between 100 mm and 96 inches')
    return dimensions


def print_profile(spec, paper=None, scale=None):
    if scale is not None and (isinstance(scale, bool) or not math.isfinite(scale) or scale <= 0):
        raise ValueError('Scale denominator must be finite and positive')
    page = parse_paper(paper) if paper else None
    if page is None and scale is None:
        page = parse_paper('36x24in')
    west, south, east, north = spec.bbox
    lat, lon = spec.center
    geod = Geod(ellps='WGS84')
    distance = lambda latitude: geod.inv(west, latitude, east, latitude)[2]
    width = distance(lat)
    map_width = width * 1000 / scale if scale else None
    if map_width and max(map_width, map_width * spec.height / spec.width) + 12 > MAX_PAGE_MM:
        raise ValueError('Requested scale exceeds the 96-inch page limit')
    return {'version': 1, 'paperMm': page, 'scaleDenominator': scale,
            'mapWidthMm': map_width, 'marginMm': 6, 'tickMarginMm': 5, 'maxPageMm': MAX_PAGE_MM,
            'centerLatitude': lat, 'groundMeters': {'width': width,
                'height': geod.inv(lon, south, lon, north)[2],
                'northWidth': distance(north), 'southWidth': distance(south)},
            'points': dict(POINTS), 'contourIntervalsFeet': list(spec.contour_intervals)}


def add_print_arguments(parser):
    parser.add_argument('--print', dest='print_map', action='store_true', help='Build a physical print sheet')
    parser.add_argument('--paper', help='Page dimensions, for example 36x24in or 914.4x609.6mm')
    parser.add_argument('--scale', type=float, help='Nominal centre east-west scale denominator')


def physical_annotations(tree, manifest):
    """Give authored x/y labels and symbols the same anchor-relative sizing as portable ones."""
    import xml.etree.ElementTree as ET
    from label_manifest import NS
    annotations={a['id']:a for a in manifest.annotations}
    for element in list(tree.iter()):
        a=annotations.get(element.get('data-layout-id'))
        if not a or a.get('geometryId') or 'var(--k)' in ET.tostring(element,encoding='unicode'):
            continue
        x,y=a['anchor']
        content=ET.Element('{'+NS+'}g',{'style':f'transform:translate({x}px,{y}px) scale(var(--k)) translate({-x}px,{-y}px)'})
        for child in list(element):element.remove(child);content.append(child)
        element.append(content)


def make_print_sheet(svg, manifest, context, spec, profile):
    """Compose one self-contained print sheet; finalization measures its collar."""
    import base64
    import io
    import json
    import xml.etree.ElementTree as ET
    from datetime import datetime, timezone
    from html import escape
    from pathlib import Path
    from PIL import Image, ImageStat
    import numpy as np
    from label_manifest import NS, embedded_fonts, layout_script, safe_json
    from .integration import transport_legend
    from .terrain import COVER, COVER_LABELS
    from .furniture import coordinate_ticks

    if context is None:
        raise ValueError('Printing requires the regional source catalog; fetch this map\'s sources first')
    manifest.print_profile = profile
    tree = ET.fromstring(svg)
    physical_annotations(tree,manifest)
    for child in list(tree):
        if set(child.get('class', '').split()) & {'cartouche', 'scale', 'coordinate-grid', 'neatline'}:
            tree.remove(child)
    tree.set('data-renderer', 'svg')
    tree.set('data-print-map', '')
    # Report the actual embedded raster resolution, including resampled land cover.
    profile['rasters'] = []
    for element in tree.iter('{'+NS+'}image'):
        href = element.get('href', '')
        if 't-dark' in element.get('class', '') or not href.startswith('data:image/'):
            continue
        image = Image.open(io.BytesIO(base64.b64decode(href.split(',', 1)[1])))
        kind = 'landcover' if 'landcover' in element.get('class', '') else 'relief'
        info = {'layer': kind, 'pixels': list(image.size), 'normalizedSampleSpacingMeters': None, 'nativePixelMeters': None}
        stats=ImageStat.Stat(image.convert('RGB'))
        info['pixelStatistics']={'mean':stats.mean,'stddev':stats.stddev}
        metadata = Path('cache')/spec.id/('landcover.json' if kind == 'landcover' else 'dem.json')
        # Integration shades the legacy DEM, not the separate regional DEM cache.
        if kind=='relief' and spec.id=='grand_canyon':
            info['provenance']='Legacy dem.npy relief; native sampling metadata unavailable'
            if Path('dem.npy').exists():
                h,w=np.load('dem.npy',mmap_mode='r',allow_pickle=False).shape
                info['normalizedSampleSpacingMeters']=[profile['groundMeters']['width']/w,profile['groundMeters']['height']/h]
        elif metadata.exists():
            data = json.loads(metadata.read_text()); shape = data.get('shape')
            if shape:
                info['normalizedSampleSpacingMeters'] = [profile['groundMeters']['width']/shape[1], profile['groundMeters']['height']/shape[0]]
            if data.get('nativeGrid',{}).get('epsg')==5070:info['nativePixelMeters']=data['nativeGrid']['pixelSize']
            info['sourceExportRegistration']=data.get('nativeRegistration')
            info['source']=data.get('source')
        profile['rasters'].append(info)

    legend = ET.fromstring('<div>'+transport_legend(context)+'</div>')
    # Keep swatches and headings, leaving interactive explanatory prose in the HTML explorer.
    for item in list(legend):
        if 'lg-title' not in item.get('class', '') and not list(item):
            legend.remove(item)
    land_path = Path('cache')/spec.id/'landcover.npy'
    if land_path.exists():
        cover = Image.fromarray(np.load(land_path, allow_pickle=False).astype('uint8')).resize((spec.width, spec.height),Image.Resampling.NEAREST)
        active_cover = set(np.unique(cover).tolist())
    else:
        tags = [f.get('tags', {}) for f in context['catalog']['features'] if f['kind']=='landcover']
        lookup = {'wood':42,'forest':42,'grassland':71,'grass':71,'meadow':71,'scrub':52,'wetland':90,'glacier':12,'bare_rock':31,'sand':31}
        active_cover = {lookup.get(t.get('natural'),lookup.get(t.get('landuse'))) for t in tags}
    # Use the same palette and alpha as the printed raster, including distinct NLCD classes.
    for item in list(legend):
        if item.find('i') is not None: legend.remove(item)
    heading = next(item for item in legend if item.text == 'Land cover')
    for code in sorted(active_cover & COVER.keys(),reverse=True):
        legend.insert(list(legend).index(heading)+1,ET.fromstring(f'<span class="lg-item"><i class="cover-swatch" style="background:{COVER[code]};opacity:{190/255}"/>{COVER_LABELS[code]}</span>'))
    # Resolve these swatches from actual visible map paint after physical sizing.
    def paint_key(selector, label, area=False):
        item=ET.SubElement(legend,'span',{'class':'lg-item'})
        icon=ET.SubElement(item,'svg',{'data-print-match':selector,'viewBox':'0 0 64 14','width':'64','height':'14'})
        ET.SubElement(icon,'path',{'d':'M2,2 H62 V12 H2 Z' if area else 'M2,7 H62','fill':'none'})
        icon.tail=label
    water_styles={(('river' if 'river' in e.get('class','').split() else 'stream'),e.get('data-flow')) for e in tree.iter('{'+NS+'}path') if 'water-line' in e.get('class','').split()}
    for kind,flow in sorted(water_styles):
        paint_key(f'.water-line.{kind}[data-flow="{flow}"]',kind.title()+(' · explicitly intermittent' if flow=='intermittent' else ' · perennial' if flow=='perennial' else ' · flow unknown'))
    if context['report']['selected'].get('waterbody'):paint_key('.area-waterbody','Water area',True)
    if context['report']['selected'].get('building'):paint_key('.area-building','Building footprint',True)
    for cls,label in [('cx','Index contour'),('ci:not(.cf):not(.cff)','Contour'),('cf','Detail contour'),('cff','Fine contour')]:
        paint_key('.contours .'+cls,label)
    # Remove headings whose group contains no remaining swatches.
    for item in list(legend):
        if 'lg-title' in item.get('class',''):
            siblings=list(legend); index=siblings.index(item)
            if index+1==len(siblings) or 'lg-title' in siblings[index+1].get('class',''):legend.remove(item)
    key = ''.join(ET.tostring(item,encoding='unicode') for item in legend)

    ticks = []
    west,south,east,north = spec.bbox
    for axis,value,label in coordinate_ticks(spec):
        f=(value-west)/(east-west) if axis=='lon' else (north-value)/(north-south)
        if not .04<f<.96:continue  # Keep corner labels clear of the trim-safe margin.
        for edge in (('top','bottom') if axis=='lon' else ('left','right')):
            ticks.append(f'<span class="tick {edge}" style="{"left" if axis=="lon" else "top"}:{f*100}%">{label}</span>')
    sources = context['catalog']['sources']
    dates = '; '.join(f'{s.get("provider", "Unknown provider")}: {s.get("datasetVersion") or "version unknown"}, retrieved {(s.get("retrievedAt") or "date unknown")[:10]}' for s in sources)
    gaps = context['catalog'].get('sourceInventory',{}).get('missing',[])
    if gaps: dates += '; Unavailable sources: '+', '.join(gaps)
    if not dates: dates = 'Source dates not supplied.'
    date = datetime.now(timezone.utc).date().isoformat()
    directory = Path(__file__).parent
    css = embedded_fonts()+''.join((directory/name).read_text() for name in ('map.css','styles.css','print.css'))
    collar = f'''<footer class="print-collar">
<div class="print-measures"><div id="print-north" aria-label="True north">↑ N <small>TRUE NORTH</small></div>
<div><b>Nominal scale <span id="print-ratio">calculating</span></b><br>Centre east–west at {spec.center[0]:.3f}° latitude
<div class="print-scales"><span id="print-metric"></span><span id="print-imperial"></span></div></div>
<div>Contour interval: <b id="print-interval">calculating</b> ft · elevations in feet<br>WGS84 longitude/latitude · geographic affine frame<br>Scale varies with position and direction</div>
<div><div id="print-calibration">100 mm calibration</div>Print at actual size / 100% · disable fit to page</div></div>
<div class="legend print-legend">{key}</div>
<p class="print-credits">{escape(dates)}</p>
<p class="print-credits">USGS 3DEP/GNIS/3DHP · Annual NLCD · PAD-US · © OpenStreetMap contributors, ODbL.</p>
<p class="print-notice">Schematic reference, not for navigation. Use official trail guides and current conditions for planning.</p>
</footer>'''
    source_evidence={'records':sources,'inventory':context['catalog'].get('sourceInventory',{}),'issues':{'osm':context['catalog'].get('issues',[]),**context['catalog'].get('sourceIssues',{})}}
    return '<!doctype html><html lang="en" data-theme="light"><meta charset="utf-8"><title>'+escape(spec.title)+' — Print map</title><style>'+css+'</style><main class="print-sheet"><header class="print-title"><div><h1>'+escape(spec.title)+'</h1><p>'+escape(spec.subtitle)+'</p></div><small>TRAILS &amp; TERRAIN · '+date+'</small></header><div class="print-map-frame"><div class="map-wrap">'+ET.tostring(tree,encoding='unicode')+'</div><div class="print-ticks">'+''.join(ticks)+'</div></div>'+collar+'</main>'+manifest.script()+'<script type="application/json" id="print-sources">'+safe_json(source_evidence)+'</script>'+layout_script()+'</html>'
