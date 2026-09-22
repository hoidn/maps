import {test,expect} from '@playwright/test';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {finalizeStatic} from '../../scripts/finalize-static.mjs';
import {fixtureHTML} from '../support/browser-fixture.js';

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
   const scale=Math.hypot(text.getScreenCTM().a,text.getScreenCTM().b);
   return {layout:p.layout,mapWidth:map.width,points:parseFloat(getComputedStyle(text).fontSize)*scale*72/96,
    calibration:document.querySelector('#print-calibration').getBoundingClientRect().width,
    runtime:!!document.querySelector('#map-layout-runtime'),bodyWidth:document.body.scrollWidth,
    pageWidth:document.querySelector('.print-sheet').getBoundingClientRect().width};
  });
  expect(evidence.points).toBeCloseTo(10,1);
  expect(evidence.mapWidth).toBeCloseTo(evidence.layout.mapWidthMm*96/25.4,0);
  expect(evidence.calibration).toBeCloseTo(100*96/25.4,0);
  expect(evidence.runtime).toBe(false);
  expect(evidence.bodyWidth).toBeLessThanOrEqual(report.viewport.width+1);
  sizes.push(evidence);await page.close();
 }
 expect(sizes[1].mapWidth).toBeGreaterThan(sizes[0].mapWidth);
 expect(sizes[1].layout.scaleDenominator).toBeLessThan(sizes[0].layout.scaleDenominator);
});
