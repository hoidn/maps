import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {fixtureHTML} from '../support/browser-fixture.js';
let bundle;
test.beforeAll(async()=>{
 bundle=(await build({stdin:{contents:"import './pipeline/labels/browser.js';import * as measurement from './pipeline/labels/measure.js';import {measurePointVariants} from './pipeline/labels/point-variants.js';import {buildLineCandidates} from './pipeline/labels/line-candidates.js';window.measurementTest={...measurement,measurePointVariants,buildLineCandidates};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',loader:{'.txt':'text'}})).outputFiles[0].text;
});

test('cooperative measurement stays outside source paint and follows resized camera context',async({page})=>{
 await page.setContent(await fixtureHTML());
 await page.evaluate(()=>{
  const svg=document.getElementById('mapsvg'),append=Element.prototype.append;
  window.measuringContexts=[];
  Element.prototype.append=function(...nodes){
   const result=append.apply(this,nodes);
   for(const node of nodes)if(node instanceof Element&&node.hasAttribute('data-layout-measurement')){
    const owner=node.ownerSVGElement,m=owner.getScreenCTM(),source=svg.getScreenCTM();
    measuringContexts.push({inSource:svg.contains(node),sameCamera:['a','b','c','d','e','f'].every(k=>Math.abs(m[k]-source[k])<1e-6),duplicateBindings:owner===svg?0:owner.querySelectorAll('[id],[data-layout-id]').length});
   }
   return result;
  };
 });
 await page.addScriptTag({content:bundle});
 await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();document.querySelector('.map-wrap').style.width='623.375px';mapLayout.requestView({x:12.25,y:7.5,w:300.5,h:240.4});await mapLayout.whenSettled();});
 const result=await page.evaluate(()=>({contexts:measuringContexts,status:mapLayout.status,placements:mapLayout.result.placements.length,leftovers:document.querySelectorAll('[data-layout-measurement],[data-layout-measurement-host]').length}));
 expect(result.contexts.length).toBeGreaterThan(3);expect(result.contexts.filter(c=>c.inSource)).toEqual([]);
 expect(result.contexts.every(c=>c.sameCamera&&!c.duplicateBindings)).toBe(true);expect(result.status).toBe('ready');expect(result.placements).toBeGreaterThan(0);expect(result.leftovers).toBe(0);
});

test('isolated native metrics equal source metrics for variants, path references and physical sizes',async({page})=>{
 await page.setContent(await fixtureHTML());
  await page.evaluate(()=>{
   document.getElementById('map-label-manifest').remove();const wrap=document.querySelector('.map-wrap');wrap.style.cssText='position:absolute;left:23.125px;top:71.75px;width:743.375px';
   const svg=document.getElementById('mapsvg');svg.setAttribute('viewBox','11.2 7.3 310.7 199.8');svg.setAttribute('preserveAspectRatio','xMidYMin meet');svg.style.height='497.125px';svg.style.setProperty('--k','.42');svg.style.setProperty('--s','.42');svg.style.setProperty('--test-font','"Source Sans 3"');
   svg.innerHTML='<defs><path id="source-curve" d="M10,100 Q150,60 280,100"/><path id="source-straight" d="M20,150L260,30"/></defs><g class="labels" transform="translate(4 5) rotate(7 100 100)"><g style="font-weight:600;letter-spacing:.035em;--marker:1.234"><g id="point"><text x="0" y="0" style="font-family:var(--test-font);transform:translate(90px,80px) scale(var(--k)) translate(7px,4px)">Example Creek Trailhead<tspan class="l-sub" x="0" dy="13" style="font-size:9.3px">1,234 ft</tspan></text></g><g id="straight"><g transform="translate(30 30) rotate(80)"><text text-anchor="middle">North Kaibab Trail</text></g></g><g id="curved"><text text-anchor="middle" dy="-4" style="font-style:italic"><textPath href="#source-curve" startOffset="50%">Colorado River</textPath></text></g><g id="required"><text text-anchor="middle" dy="-4"><textPath href="#source-curve" startOffset="50%">Colorado River</textPath></text></g></g></g>';
  });
 await page.addScriptTag({content:bundle});await page.evaluate(()=>measurementTest.ensureFonts());
  const result=await page.evaluate(()=>{
   const svg=document.getElementById('mapsvg'),rows=[];
   const annotations={point:{text:'Example Creek Trailhead',variants:[{lines:['Example Creek','Trailhead']}]},straight:{geometryIds:['source-straight'],text:'North Kaibab Trail',variants:[{lines:['North Kaibab','Trail']}],anchor:[140,90]},curved:{geometryId:'source-curve',style:'l-river',anchor:[140,80]},required:{geometryId:'source-curve',style:'l-trail',requiredGroup:'main',text:'Colorado River',variants:[{lines:['Colorado','River']}]}};
   for(const mode of ['interactive','fractional-zoom','physical-print']){
    if(mode==='fractional-zoom')svg.setAttribute('viewBox','19.3 11.7 193.27 124.282');
    if(mode==='physical-print'){svg.setAttribute('viewBox','0 0 310.7 199.8');svg.parentElement.style.width='1375.625px';svg.style.height='887.125px';}
    const s=Math.hypot(svg.getScreenCTM().a,svg.getScreenCTM().b);svg.style.setProperty('--k',String(1/s));svg.style.setProperty('--s',String(1/s));
    for(const id of Object.keys(annotations)){const text=document.querySelector('#'+id+' text');text.style.fontSize=(id==='point'?(mode==='physical-print'?10*96/72:14.4307):(mode==='physical-print'?9*96/72:13)/s)+'px';text.style.strokeWidth=(id==='point'?2.8:2.8/s)+'px';}
    for(const canvasInk of [false,true])for(const [id,annotation] of Object.entries(annotations)){
     const original=document.getElementById(id),clone=original.cloneNode(true);clone.removeAttribute('id');clone.style.visibility='hidden';clone.style.display='inline';clone.setAttribute('transform','');original.parentElement.append(clone);
     const measure=e=>id==='point'?{base:measurementTest.measureElement(e,0,{canvasInk}),variants:measurementTest.measurePointVariants(e,annotation,{canvasInk})}:measurementTest.buildLineCandidates({annotation,element:e,measurement:{canvasInk},policy:{maxLineCandidates:3}});
     let before;try{before=measure(clone);}finally{clone.remove();}
     const isolated=measurementTest.createMeasurementHost(svg),element=original.cloneNode(true);element.removeAttribute('id');element.style.visibility='hidden';element.style.display='inline';element.setAttribute('transform','');isolated.parentFor(original.parentElement).append(element);let after;
     try{after=measure(element);}finally{isolated.remove();}
     const exact=JSON.stringify(before)===JSON.stringify(after);rows.push({mode,canvasInk,id,count:id==='point'?before.variants.length:before.length,exact,...(!exact?{before,after}:{})});
    }
   }
   return {rows,failed:rows.filter(r=>!r.exact),count:rows.length};
  });
 expect(result.count).toBe(24);expect(result.failed).toEqual([]);expect(result.rows.every(r=>r.count>0&&r.exact)).toBe(true);
});

for(const interruption of ['camera','error','pagehide'])test(`measurement hosts are cleaned after ${interruption}`,async({page})=>{
 await page.setContent(await fixtureHTML());
 await page.evaluate(()=>{
  const source=document.getElementById('map-label-manifest'),manifest=JSON.parse(source.textContent),base=manifest.annotations[0],original=document.getElementById(base.id);
  for(let i=0;i<80;i++){const id='extra-'+i,e=original.cloneNode(true);e.id=id;e.dataset.layoutId=id;original.after(e);manifest.annotations.push({...base,id,elementId:id,variants:[{lines:['Camp','A']}]});}
  source.textContent=JSON.stringify(manifest);
 });
 await page.addScriptTag({content:bundle});await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();});
 const result=await page.evaluate(async interruption=>{
  const l=mapLayout;let interrupted=false;
  if(interruption==='error'){
   l.normalize=()=>{interrupted=true;throw new Error('Intentional measurement error');};
   l.cache.invalidate();l.lineCache.clear();await l.render(true);
  }else{
   const observer=new MutationObserver(()=>{
    if(interrupted||!document.querySelector('[data-layout-measurement-host]'))return;
    interrupted=true;
    if(interruption==='camera')l.requestView({x:5,y:7,w:250,h:200});
    else dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));
   });observer.observe(document.body,{childList:true,subtree:true});
   l.requestView({x:0,y:0,w:400,h:320});
   if(interruption==='camera')await l.whenSettled();
   else while(!interrupted)await new Promise(resolve=>setTimeout(resolve,10));
   observer.disconnect();
  }
  return {interrupted,status:l.status,error:l.error,width:l.view.w,leftovers:document.querySelectorAll('[data-layout-measurement],[data-layout-measurement-host]').length};
 },interruption);
 expect(result.interrupted).toBe(true);expect(result.leftovers).toBe(0);
 if(interruption==='camera'){expect(result.status).toBe('ready');expect(result.width).toBe(250);}
 if(interruption==='error'){expect(result.status).toBe('error');expect(result.error).toBe('Intentional measurement error');}
});
