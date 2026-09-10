#!/usr/bin/env python3
"""Build a standalone regional map from cached portable sources, without network IO."""
import argparse,json,base64
from pathlib import Path
from html import escape
import numpy as np
from PIL import Image
from map_spec import MapSpec
from label_manifest import Manifest,embedded_fonts,layout_script,stable_id
from cartography.contour_payload import pack_contours
from cartography.terrain import neutral_relief,contours
from cartography.integration import improve,catalog_panel,transport_legend
from sources.catalog import atomic_json,sha256
from sources.elevation import validate_grid

def load_dem(spec,root):
 """Verify the registered array against its acquisition metadata before use."""
 meta=json.loads((root/'dem.json').read_text());spec.validate_cache(meta)
 digest=sha256(root/'dem.npy')
 if meta.get('arraySha256')!=digest:raise ValueError('DEM cache hash mismatch')
 dem=np.load(root/'dem.npy',allow_pickle=False)
 if meta.get('dtype')!='float32' or dem.dtype!=np.dtype('float32') or meta.get('units')!='metres':raise ValueError('DEM cache dtype or units mismatch')
 registration=meta.get('registration',{})
 if registration.get('bbox')!=list(spec.bbox) or registration.get('pixelRegistration')!='area' or registration.get('sampleLocation')!='center':raise ValueError('DEM cache registration does not match exact frame pixel centers')
 validate_grid(dem,registration['bbox'],spec,meta['shape'],registration.get('nodata'))
 return dem,digest

def build(spec,renderer='webgl',mode='interactive',output=None):
 root=Path('cache')/spec.id;dem,dem_hash=load_dem(spec,root)
 terrain_path=root/'terrain.json';terrain=json.loads(terrain_path.read_text()) if terrain_path.exists() else {}
 key={'demSha256':dem_hash,'geometryVersion':'portable-contours-2-pixel-centers','frame':spec.frame,'contourIntervalsFeet':list(spec.contour_intervals)}
 if terrain.get('cacheKey')!=key:
  terrain={**neutral_relief(dem,spec),'contours':contours(dem,spec),'frame':spec.frame,'cacheKey':key};atomic_json(terrain_path,terrain)
 spec.validate_cache(terrain)
 M=Manifest(mode,spec.width,spec.height);M.required=set(spec.required_names);M.required_routes=set(spec.required_routes)
 defs=[];paint={};labels=[]
 for kind,cls in [('index','cx'),('inter','ci'),('fine','ci cf'),('finest','ci cff')]:
  paint[kind]=[]
  for row in terrain['contours'][kind]:
   for d in row['d']:
    paint[kind].append(f'<path class="{cls}" d="{d}"/>')
    if kind=='index' and len(d)>400:
     gid=stable_id('contour-geometry',d);defs.append(f'<path id="{gid}" d="{d}"/>');labels.append(f'<text class="l-contour"><textPath href="#{gid}" startOffset="50%" text-anchor="middle">{row["lv"]:,}</textPath></text>')
 w,h=spec.width,spec.height
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" id="mapsvg" class="map" data-w="{w}" data-h="{h}" data-renderer="{renderer}" viewBox="0 0 {w} {h}" role="img" aria-label="{escape(spec.title)} trails, terrain, water and public facilities"><defs>'+''.join(defs)+'</defs>'+f'<image class="terrain t-light" href="{terrain["uri_light"]}" width="{w}" height="{h}"/><image class="terrain t-dark" href="{terrain["uri_dark"]}" width="{w}" height="{h}"/>'+'<g class="contours"><g class="g-finest">'+''.join(paint['finest'])+'</g><g class="g-fine">'+''.join(paint['fine'])+'</g>'+''.join(paint['inter']+paint['index'])+'</g><g class="contour-labels">'+''.join(labels)+'</g><g class="labels"/></svg>'
 svg,context=improve(svg,M,dem,spec.id);svg=M.finalize(svg)
 svg,contour_payload=pack_contours(svg,mode=mode)
 css=(Path(__file__).parent/'cartography/map.css').read_text()+(Path(__file__).parent/'cartography/styles.css').read_text()
 # Cursor lookup is an explicitly downsampled array, preserving the full frame.
 cursor=np.asarray(Image.fromarray(dem).resize((260,round(260*h/w)),Image.Resampling.BILINEAR))*3.28084;gh,gw=cursor.shape;encoded=base64.b64encode(np.clip(cursor,0,65535).astype('<u2').tobytes()).decode()
 js=(Path(__file__).parent/'cartography/interactive.js').read_text()
 replacements={'PROFILE_JSON':'{}','DEM_GW':str(gw),'DEM_GH':str(gh),'DEM_B64':encoded,'DEM_LON0':str(spec.bbox[0]),'DEM_LON1':str(spec.bbox[2]),'DEM_LAT0':str(spec.bbox[1]),'DEM_LAT1':str(spec.bbox[3])}
 for a,b in replacements.items():js=js.replace(a,b)
 controls='<div class="ctl"><div class="zoomrow"><button id="zin" aria-label="Zoom in">+</button><button id="zout" aria-label="Zoom out">−</button><button id="zreset" aria-label="Reset view">⌂</button></div><select id="goto" aria-label="Go to a place"></select><details class="layers"><summary>Layers</summary><div class="box">'
 for layer,name,checked in [('relief','Shaded relief',True),('landcover','Land cover',True),('boundaries','Land boundaries',True),('water','Water',True),('contours','Contours',True),('places','Facilities and places',True),('peaks','Summits',True),('names','Names',True),('grid','Coordinate grid',False)]:controls+=f'<label><input type="checkbox" data-layer="no-{layer}" {"checked" if checked else ""}> {name}</label>'
 controls+='<label>Text size<select id="text-size"><option value="1">Standard</option><option value="1.25">Large</option><option value="1.5">Extra large</option></select></label></div></details></div><div class="zlabel" id="zlabel"></div><div class="readout" id="readout"></div><div class="ttip" id="ttip" hidden></div>'
 page='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>'+escape(spec.title)+' Trail Explorer</title><style>'+embedded_fonts()+css+'[data-layout-id]{visibility:hidden}</style><main class="sheet"><header class="mast"><div><p class="eyebrow">Trails and terrain</p><h1>'+escape(spec.title)+'</h1><p class="lede">'+escape(spec.subtitle)+'</p></div></header><figure class="map-fig"><div class="map-wrap">'+svg+controls+'</div><figcaption class="legend">'+transport_legend(context)+'<span>Drag to pan · scroll or pinch to zoom · select a trail or find a place</span></figcaption></figure>'+catalog_panel(context)+'<footer><p>Terrain and geographic names: USGS 3DEP and GNIS. Hydrography: USGS 3DHP. Land cover: Annual NLCD. Land boundaries: PAD-US. Roads, trails and facilities: © OpenStreetMap contributors (ODbL). Source versions and retrieval dates are listed above.</p><p>Schematic reference, not for navigation. Use official trail guides and current conditions for planning.</p></footer></main>'+M.script()+contour_payload+layout_script()+'<script>'+js+'</script></html>'
 path=Path(output or f'{spec.id}_trails_{mode}.html');path.write_text(page);print('wrote',path,len(page)//1024,'KB',len(M.annotations),'annotations',flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--map',default='sequoia');p.add_argument('--renderer',choices=['svg','canvas','webgl'],default='webgl');p.add_argument('--mode',choices=['static','interactive'],default='interactive');p.add_argument('--output');a=p.parse_args();build(MapSpec.load(a.map),a.renderer,a.mode,a.output)
