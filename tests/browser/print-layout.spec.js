import {test,expect} from '@playwright/test';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {finalizeStatic} from '../../scripts/finalize-static.mjs';
import {fixtureHTML} from '../support/browser-fixture.js';

test('authored print placement survives serialized fractional page dimensions',async({browserName})=>{
 test.skip(browserName!=='chromium','Finalization audits all three engines with JavaScript disabled');
 test.setTimeout(240000);
 const dir=await mkdtemp(join(tmpdir(),'map-authored-print-')),python=resolve('.venv/bin/python');
 execFileSync(python,['tests/support/build-fixture.py',dir]);
 execFileSync(python,['-c',`import sys,json
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from map_spec import MapSpec
from features import catalog_from_osm
from sources.catalog import atomic_json,record_source
spec=MapSpec.load('grand_canyon');path=Path('cache/grand_canyon/features.json')
atomic_json(path,catalog_from_osm(json.loads(Path('osm.json').read_text())['elements'],spec))
record_source(path,provider='Synthetic OSM fixture',url='synthetic:test-fixture',retrieved_at='2026-01-01T00:00:00Z',dataset_version='synthetic-test-only',bbox=spec.bbox)`,resolve('pipeline')],{cwd:dir});
 const input=join(dir,'print.html'),output=join(dir,'frozen.html');
 execFileSync(python,[resolve('pipeline/build_static.py'),'--print','--paper','36x24in','--output',input],{cwd:dir});
 const report=await finalizeStatic({input,output,reportDir:join(dir,'layout')});
 expect(report.audits).toHaveLength(6);
 expect(report.audits.every(a=>a.status==='pass')).toBe(true);
});

test('print protected trail footprints match ink while the physical sheet is resized',async({page})=>{
 let html=await fixtureHTML();
 html=html.replace('</svg>','<g class="trails"><path id="print-trail" data-layout-obstacle="trail" d="M100,100 L200,100" stroke="black" style="stroke-width:calc(2.6px * var(--s))"/></g></svg>');
 await page.setContent(html);
 await page.evaluate(()=>{const el=document.getElementById('map-label-manifest'),m=JSON.parse(el.textContent);m.map.mode='static';m.map.print={version:1,paperMm:[914.4,609.6],mapWidthMm:null,marginMm:6,tickMarginMm:5,maxPageMm:2438.4,groundMeters:{width:10000,height:8000,northWidth:10000,southWidth:10000},points:{place:10,secondary:8,trail:9,region:12,major:12,settlement:12,road:8,roadMajor:9,roadRef:9,contour:7},contourIntervalsFeet:[250,100,50]};el.textContent=JSON.stringify(m);});
 await page.addScriptTag({content:await readFile('pipeline/labels/dist/browser.js','utf8')});
 const rows=await page.evaluate(async()=>{const c=mapLayout;await c.ready;const rows=[];for(const width of [1000,1500]){c.svg.style.width=width+'px';c.svg.style.height=width*.8+'px';c.svg.style.maxWidth='none';await c.requestView({x:0,y:0,w:500,h:400});await c.whenSettled();const {m,s,z}=c.camera(),e=document.getElementById('print-trail'),q=c.trailQuery(m,s,z),obstacles=q({x:m.a*100+m.e-5,y:m.d*100+m.f-5,width:10,height:10});rows.push({ink:parseFloat(getComputedStyle(e).strokeWidth)*s,obstacle:obstacles[0]?.line.width});}return rows;});
 for(const row of rows){expect(row.ink).toBeCloseTo(2.6,3);expect(row.obstacle).toBeCloseTo(row.ink,3);}
});

test('authored point labels, sublabels and symbols keep physical sizes without moving source anchors',async({page})=>{
 const raw='<svg xmlns="http://www.w3.org/2000/svg"><g id="label-0" data-layout-id="label-0" data-feature-id="f-a"><text class="l-place" x="107" y="104">Camp A<tspan x="107" dy="10">Authored detail</tspan></text></g><g id="authored-symbol" data-layout-id="authored-symbol"><g transform="translate(100,300)"><circle r="4" fill="black"/></g></g></svg>';
 const wrapped=execFileSync(resolve('.venv/bin/python'),['-c',`import sys,xml.etree.ElementTree as ET
from types import SimpleNamespace
sys.path.insert(0,sys.argv[1])
from cartography.print_sheet import physical_annotations
tree=ET.fromstring(sys.argv[2]);physical_annotations(tree,SimpleNamespace(annotations=[{'id':'label-0','anchor':[100,100]},{'id':'authored-symbol','anchor':[100,300]}]))
print(''.join(ET.tostring(e,encoding='unicode') for e in tree))`,resolve('pipeline'),raw],{encoding:'utf8'});
 let html=await fixtureHTML('static');html=html.replace(/<g id="label-0"[\s\S]*?<\/g>/,'').replace('</svg>',wrapped+'</svg>');
 await page.setContent(html);
 await page.evaluate(()=>{const el=document.getElementById('map-label-manifest'),m=JSON.parse(el.textContent);m.map.print={version:1,paperMm:[914.4,609.6],mapWidthMm:null,marginMm:6,tickMarginMm:5,maxPageMm:2438.4,groundMeters:{width:10000,height:8000,northWidth:10000,southWidth:10000},points:{place:10,secondary:8,trail:9,region:12,major:12,settlement:12,road:8,roadMajor:9,roadRef:9,contour:7},contourIntervalsFeet:[250,100,50]};m.features.push({id:'f-symbol',anchor:[100,300]});m.annotations.push({id:'authored-symbol',elementId:'authored-symbol',featureId:'f-symbol',kind:'symbol',symbolKind:'camp',layer:'places',anchor:[100,300],priority:800,requiredProfiles:[]});el.textContent=JSON.stringify(m);});
 await page.addScriptTag({content:await readFile('pipeline/labels/dist/browser.js','utf8')});
 const rows=await page.evaluate(async()=>{const c=mapLayout;await c.ready;const rows=[];for(const width of [1000,1500]){c.svg.style.width=width+'px';c.svg.style.height=width*.8+'px';c.svg.style.maxWidth='none';await c.requestView({x:0,y:0,w:500,h:400});await c.whenSettled();const t=document.querySelector('#label-0 text'),sub=t.querySelector('tspan'),circle=document.querySelector('#authored-symbol circle'),pointSize=e=>parseFloat(getComputedStyle(e).fontSize)*Math.hypot(e.getScreenCTM().a,e.getScreenCTM().b)*72/96;rows.push({points:pointSize(t),secondary:pointSize(sub),symbol:circle.getBoundingClientRect().width,anchor:c.manifest.annotations.find(a=>a.id==='label-0').anchor});}return rows;});
 for(const row of rows){expect(row.points).toBeCloseTo(10,2);expect(row.secondary).toBeCloseTo(8,2);expect(row.symbol).toBeCloseTo(8,2);expect(row.anchor).toEqual([100,100]);}
});

test('print freezing preserves physical typography, scale and collar across page sizes',async({browserName,browser})=>{
 test.skip(browserName!=='chromium','Finalization itself audits all three browser engines');
 test.setTimeout(240000);
 const dir=await mkdtemp(join(tmpdir(),'map-print-layout-')),python=resolve('.venv/bin/python');
 execFileSync(python,['tests/support/build-fixture.py',dir,'--regional']);
 const sizes=[];
 for(const paper of ['24x18in','36x24in']){
  const input=join(dir,'input.html'),output=join(dir,'frozen.html');
  execFileSync(python,[resolve('pipeline/build_region.py'),'--map',join(dir,'custom-region.json'),'--mode','static','--print','--paper',paper,'--output',input],{cwd:dir});
  const report=await finalizeStatic({input,output,reportDir:join(dir,paper)});
  expect(report.audits).toHaveLength(6);
  const page=await browser.newPage({javaScriptEnabled:false,viewport:report.viewport});
  await page.setContent(await readFile(output,'utf8'));
  const evidence=await page.evaluate(()=>{
   const p=JSON.parse(document.querySelector('#map-label-manifest').textContent).map.print;
   const map=document.querySelector('#mapsvg').getBoundingClientRect();
   const text=[...document.querySelectorAll('#mapsvg [data-layout-id] text')].find(e=>e.textContent==='Synthetic Camp');
   const trail=[...document.querySelectorAll('#mapsvg [data-layout-id] text')].find(e=>e.textContent==='Synthetic Trail'&&getComputedStyle(e).visibility==='visible');
   const water=document.querySelector('.print-legend [data-print-match^=".water-line"] path'),stream=document.querySelector('#mapsvg .water-line');
   const scale=Math.hypot(text.getScreenCTM().a,text.getScreenCTM().b);
   return {layout:p.layout,mapWidth:map.width,points:parseFloat(getComputedStyle(text).fontSize)*scale*72/96,
    pathPoints:trail&&parseFloat(getComputedStyle(trail).fontSize)*Math.hypot(trail.getScreenCTM().a,trail.getScreenCTM().b)*72/96,
    waterWidth:parseFloat(getComputedStyle(water).strokeWidth),streamWidth:parseFloat(getComputedStyle(stream).strokeWidth)*Math.hypot(stream.getScreenCTM().a,stream.getScreenCTM().b),
    calibration:document.querySelector('#print-calibration').getBoundingClientRect().width,
    runtime:!!document.querySelector('#map-layout-runtime'),bodyWidth:document.body.scrollWidth,
    pageWidth:document.querySelector('.print-sheet').getBoundingClientRect().width};
  });
  expect(evidence.points).toBeCloseTo(10,1);
  expect(evidence.pathPoints).toBeCloseTo(9,1);
  expect(evidence.waterWidth).toBeCloseTo(evidence.streamWidth,3);
  expect(evidence.mapWidth).toBeCloseTo(evidence.layout.mapWidthMm*96/25.4,0);
  expect(evidence.calibration).toBeCloseTo(100*96/25.4,0);
  expect(evidence.runtime).toBe(false);
  expect(evidence.bodyWidth).toBeLessThanOrEqual(report.viewport.width+1);
  sizes.push(evidence);await page.close();
 }
 expect(sizes[1].mapWidth).toBeGreaterThan(sizes[0].mapWidth);
 expect(sizes[1].layout.scaleDenominator).toBeLessThan(sizes[0].layout.scaleDenominator);
});

test('print collar describes painted classes, omitted facilities and unknown source metadata',async({browserName,browser})=>{
 test.skip(browserName!=='chromium','Finalization audits all engines');test.setTimeout(240000);
 const dir=await mkdtemp(join(tmpdir(),'map-print-legend-')),python=resolve('.venv/bin/python');
 execFileSync(python,['tests/support/build-fixture.py',dir,'--regional']);
 execFileSync(python,['-c',`import json
from pathlib import Path
p=Path('cache/sequoia/features.json');data=json.loads(p.read_text())
data['features']=[f for f in data['features'] if f['kind']!='waterway']
next(f for f in data['features'] if f['kind']=='trail')['tags']['access']='private'
polygon={'type':'Polygon','coordinates':[[[-118.195,34.13],[-118.195,34.16],[-118.17,34.16],[-118.17,34.13],[-118.195,34.13]]]}
east_polygon={'type':'Polygon','coordinates':[[[x+.04,y] for x,y in polygon['coordinates'][0]]]}
for identity,kind,geometry,tags,props in [('covered','landcover',polygon,{'natural':'grassland'},{}),('forest','landcover',polygon,{'natural':'wood'},{}),('scrub','landcover',east_polygon,{'natural':'scrub'},{}),('boundary','boundary',polygon,{}, {'Category':'Fee'}),('bench','poi',{'type':'Point','coordinates':[-118.12,34.105]},{'amenity':'bench'},{})]:
 data['features'].append({'id':'osm:synthetic:'+identity,'provider':'osm','kind':kind,'name':None,'geometry':geometry,'tags':tags,'properties':props,'routeIds':[]})
p.write_text(json.dumps(data))
for record in p.parent.glob('*.source.json'):record.unlink()`],{cwd:dir});
 const input=join(dir,'print.html'),output=join(dir,'frozen.html');
 execFileSync(python,[resolve('pipeline/build_region.py'),'--map',join(dir,'custom-region.json'),'--mode','static','--print','--paper','36x24in','--output',input],{cwd:dir});
 await finalizeStatic({input,output,reportDir:join(dir,'layout')});
 const page=await browser.newPage({javaScriptEnabled:false});await page.setContent(await readFile(output,'utf8'));
 const evidence=await page.evaluate(()=>{
  const visible=e=>getComputedStyle(e.closest('.lg-item')||e).display!=='none';
  const legend=document.querySelector('.print-legend'),manifest=JSON.parse(document.getElementById('map-label-manifest').textContent);
  const report=JSON.parse(document.getElementById('map-layout-frozen-report').textContent);
  const symbols=manifest.annotations.filter(a=>a.kind==='symbol'),placed=new Set(report.outcomes.filter(o=>o.reason==='placed').map(o=>o.id));
  return {water:legend.querySelectorAll('[data-print-match^=".water"]').length,
   cover:[...legend.querySelectorAll('.cover-swatch')].map(e=>e.parentElement.textContent),
   coverOpacity:Number(getComputedStyle(legend.querySelector('.cover-swatch')).opacity),imageOpacity:Number(getComputedStyle(document.querySelector('#mapsvg .landcover.t-light')).opacity),
   restricted:[...legend.querySelectorAll('[data-transport-key]')].some(e=>visible(e)&&e.dataset.transportKey.includes(':restricted:')),
   boundaries:[...legend.querySelectorAll('[data-boundary-key]')].filter(visible).map(e=>e.dataset.boundaryKey),
   hiddenKinds:[...new Set(symbols.filter(a=>!placed.has(a.id)).map(a=>a.symbolKind))].filter(kind=>!symbols.some(a=>a.symbolKind===kind&&placed.has(a.id))),
   legendKinds:[...legend.querySelectorAll('[data-legend-symbols]')].filter(visible).flatMap(e=>e.dataset.legendSymbols.split(' ')),
   text:document.querySelector('.print-collar').textContent,
  };
 });
 expect(evidence.water).toBe(0);expect(evidence.cover.sort()).toEqual(['Evergreen forest','Shrub / scrub']);
 expect(evidence.coverOpacity).toBeCloseTo(190/255*evidence.imageOpacity,5);
 expect(evidence.restricted).toBe(true);expect(evidence.boundaries).toEqual(['ownership']);
 expect(evidence.hiddenKinds.length).toBeGreaterThan(0);expect(evidence.hiddenKinds.some(kind=>evidence.legendKinds.includes(kind))).toBe(false);
 expect(evidence.text).toContain('Source dates not supplied');expect(evidence.text).not.toContain('NAVD88');
 await page.close();
});
