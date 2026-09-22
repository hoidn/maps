import {test,expect,chromium,firefox,webkit} from '@playwright/test';
import {build} from 'esbuild';
import {fixtureHTML} from '../support/browser-fixture.js';
import {collectTypography,checkTypography} from '../support/typography-audit.js';
import {staticMeasurementEnvelope} from '../../scripts/finalize-static.mjs';

// Exact source anchors, typography and declared wraps from five failed 1:50k
// San Gabriel placements. No per-label positioning correction is applied.
const cases=[
 {id:'label-458a99bda339dc57',sourceId:'gnis:243804',anchor:[217,169.5],position:[217.016,169.535],text:'Indian Canyon',style:'l-minor',weight:400,lines:[['Indian','Canyon']]},
 {id:'label-40ea032bb849e7ae',sourceId:'osm:node:12442796222',anchor:[792.4,677.2],position:[792.360,677.172],text:'Petco',style:'l-place',weight:600},
 {id:'label-3c27bfecd1523521',sourceId:'osm:node:746899302',anchor:[324.8,684.8],position:[324.821,684.808],text:'Ernest E. Debs',style:'l-peak',weight:400,lines:[['Ernest','E. Debs'],['Ernest E.','Debs'],['Ernest','E.','Debs']]},
 {id:'label-1e5f6e355866df23',sourceId:'osm:way:431658505',anchor:[51.5,530.3],position:[51.481,530.294],text:"Carl's Jr.",style:'l-place',weight:600,lines:[["Carl's",'Jr.']]},
 {id:'label-0622bba1c309c18f',sourceId:'osm:way:664008783',anchor:[1079.4,675.5],position:[1079.394,675.521],text:"McDonald's",style:'l-place',weight:600},
];
const viewport={width:7249,height:4181},referenceSize={width:7165.38,height:3775.6};
let bundle,prefix;
test.beforeAll(async()=>{
 bundle=(await build({stdin:{contents:"export {LayoutController} from './pipeline/labels/runtime.js'; export {default as policy} from './pipeline/labels/policy.json';",resolveDir:process.cwd()},bundle:true,format:'iife',globalName:'pointFont',write:false,loader:{'.txt':'text'}})).outputFiles[0].text;
 const html=await fixtureHTML('static');prefix=html.slice(0,html.indexOf('<div class="map-wrap">'));
});
function fixture(){
 const annotations=cases.map(c=>({...c,elementId:c.id,featureId:c.sourceId,kind:'point-label',layer:'places',priority:550,requiredProfiles:[],variants:c.lines?.map(lines=>({lines}))}));
 const manifest={version:1,map:{width:1300,height:685,mode:'static',metersPerMapUnit:72.91692319998185,requiredRoutes:[],print:{version:1,paperMm:null,mapWidthMm:1895.8400031995282,scaleDenominator:50000,marginMm:6,tickMarginMm:5,maxPageMm:2438.4,groundMeters:{width:94792.00015997641,height:49917.722385879104,northWidth:94538.25888217885,southWidth:95044.27701510253},points:{place:10,secondary:8,trail:9,region:12,major:12,settlement:12,road:8,roadMajor:9,roadRef:9,contour:7},contourIntervalsFeet:[250,100,50]}},features:cases.map(c=>({id:c.sourceId,sourceId:c.sourceId,name:c.text,anchor:c.anchor})),annotations};
 return prefix+`<div class="map-wrap" style="width:7165.38px;max-width:none"><svg xmlns="http://www.w3.org/2000/svg" id="mapsvg" class="map" viewBox="0 0 1300 685" style="width:7165.38px;height:3775.6px;max-width:none;min-width:7165.38px"><g class="labels">${cases.map(c=>`<g id="${c.id}" data-layout-id="${c.id}" data-feature-id="${c.sourceId}"><text class="${c.style}" x="0" y="0" style="font-weight:${c.weight};transform:translate(${c.position[0]}px,${c.position[1]}px) scale(var(--k)) translate(8px,-6px)">${c.text}</text></g>`).join('')}</g></svg></div><script id="map-label-manifest" type="application/json">${JSON.stringify(manifest)}</script>`;
}

test('font probes retain the original name when the initial solve selects a wrap',async({page,browserName})=>{
 test.skip(browserName!=='chromium','The envelope probes all three engines.');
 await page.setViewportSize(viewport);await page.setContent(fixture());await page.addScriptTag({content:bundle});
 const selected=await page.evaluate(async()=>{
  const id='label-1e5f6e355866df23',svg=document.getElementById('mapsvg'),node=document.getElementById('map-label-manifest'),manifest=JSON.parse(node.textContent);
  for(const e of svg.querySelectorAll('[data-layout-id]'))if(e.id!==id)e.remove();
  manifest.map.width=8.6;manifest.map.height=30;manifest.annotations=manifest.annotations.filter(a=>a.id===id);manifest.annotations[0].anchor=[4.3,15];
  node.textContent=JSON.stringify(manifest);svg.setAttribute('viewBox','0 0 8.6 30');svg.style.cssText='width:47.4075px;height:165.375px;min-width:47.4075px;max-width:none';
  document.getElementById(id).querySelector('text').style.transform='translate(4.3px,15px) scale(var(--k)) translate(8px,-6px)';
  window.mapLayout=new pointFont.LayoutController(svg,manifest,pointFont.policy);await mapLayout.ready;await mapLayout.whenSettled();mapLayout.observer.disconnect();
  return {candidate:mapLayout.result.placements[0]?.candidateId,text:document.getElementById(id).textContent,original:manifest.annotations[0].text};
 });
 expect(selected.candidate).toMatch(/^wrap-/);expect(selected.text).not.toBe(selected.original);
 const envelope=await staticMeasurementEnvelope(page,viewport,{width:47.4075,height:165.375});
 expect(envelope.pointPaintInsets['label-1e5f6e355866df23'].right).toBeGreaterThan(2.7);
});

test('physical point candidates retain painted proximity in every font engine, including lazy wraps',async({browserName})=>{
 test.skip(browserName!=='chromium','One differential test applies identical prepared candidates in all engines.');
 const reference=await chromium.launch();let envelope,prepared;
 try{
  const page=await reference.newPage({viewport});await page.setContent(fixture());await page.addScriptTag({content:bundle});
  await page.evaluate(async()=>{window.mapLayout=new pointFont.LayoutController(document.getElementById('mapsvg'),JSON.parse(document.getElementById('map-label-manifest').textContent),pointFont.policy);await mapLayout.ready;await mapLayout.whenSettled();mapLayout.observer.disconnect();});
  envelope=await staticMeasurementEnvelope(page,viewport,referenceSize);
  prepared=await page.evaluate(async envelope=>{
   const c=window.mapLayout;c.policy={...c.policy,measurementReserves:envelope.byAnnotation,pointPaintInsets:envelope.pointPaintInsets};c.previous=null;c.cache.invalidate();c.invalidateLayout();await c.requestView({x:0,y:0,w:1300,h:685});await c.whenSettled();
   const {s}=c.camera(),rows=c.prepared.map(a=>({id:a.id,sourceId:a.sourceId,anchor:c.byId.get(a.id).anchor,recipeId:a.fallbackData?.annotation.id,candidates:[...a.candidates,...a.fallbackCandidates()].map(p=>({id:p.id,dx:p.dx,dy:p.dy,textHTML:p.textHTML??c.byId.get(a.id).originalTextHTML}))}));
   return {rows,scale:s,html:document.getElementById('mapsvg').outerHTML,manifest:JSON.parse(document.getElementById('map-label-manifest').textContent),policy:c.policy};
  },envelope);
 }finally{await reference.close();}
 for(const [name,engine] of Object.entries({chromium,firefox,webkit})){
  const browser=await engine.launch();
  try{
   const page=await browser.newPage({viewport});await page.setContent(prefix+prepared.html+`<script id="map-label-manifest" type="application/json">${JSON.stringify(prepared.manifest)}</script>`);
   await page.evaluate(async()=>{for(const t of document.querySelectorAll('text'))await document.fonts.load(getComputedStyle(t).font,t.textContent);await document.fonts.ready;});
   const painted=await page.evaluate(({rows,scale,collector})=>{
    const collect=(0,eval)('('+collector+')'),result=[];
    for(const e of document.querySelectorAll('[data-layout-id]'))e.style.display='none';
    for(const row of rows){const e=document.getElementById(row.id),text=e.querySelector('text');e.style.display='inline';e.style.visibility='visible';
     for(const p of row.candidates){text.innerHTML=p.textHTML;e.setAttribute('transform',`translate(${p.dx/scale} ${p.dy/scale})`);result.push({candidate:p.id,typography:collect()});}
     e.style.display='none';
    }return result;
   },{rows:prepared.rows,scale:prepared.scale,collector:collectTypography.toString()});
   const failures=painted.flatMap(({candidate,typography})=>checkTypography(typography,prepared.policy).map(f=>({candidate,...f})));
   expect(failures.slice(0,5),name).toEqual([]);
  }finally{await browser.close();}
 }
 const identities=rows=>rows.map(r=>({id:r.id,sourceId:r.sourceId,anchor:r.anchor})).sort((a,b)=>a.id.localeCompare(b.id));
 expect(identities(prepared.rows)).toEqual(identities(cases));
 for(const row of prepared.rows){expect(row.recipeId).toBe(row.id);expect(row.candidates.filter(c=>c.id.includes('grid-')).length).toBeGreaterThan(100);}
 expect(prepared.rows.some(r=>r.candidates.some(c=>c.id.startsWith('wrap-')))).toBe(true);
 expect(envelope.pointPaintInsets['label-1e5f6e355866df23'].right).toBeGreaterThan(2.7);
});
