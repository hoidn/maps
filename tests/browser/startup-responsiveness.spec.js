import {test,expect} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import fs from 'node:fs/promises';
for(const mode of ['interactive','static'])test(`${mode} eligibility samples viewport width once per preparation`,async({page})=>{
 await page.setContent(await fixtureHTML(mode));
 await page.evaluate(()=>{
  const source=document.getElementById('map-label-manifest'),manifest=JSON.parse(source.textContent),base=manifest.annotations[0],original=document.getElementById(base.elementId);
  manifest.map.metersPerMapUnit=30;
  for(let i=0;i<60;i++){
   const id='detail-'+i,element=original.cloneNode(true);element.id=id;element.dataset.layoutId=id;original.after(element);
   manifest.annotations.push({...base,id,elementId:id,requiredProfiles:[],geometryBounds:[99,99,101,101],maxMetersPerPixel:20});
  }
  source.textContent=JSON.stringify(manifest);
  const width=Object.getOwnPropertyDescriptor(Element.prototype,'clientWidth').get;
  window.viewportWidthReads=0;
  Object.defineProperty(document.getElementById('mapsvg'),'clientWidth',{get(){viewportWidthReads++;return width.call(this);}});
 });
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});await page.evaluate(()=>mapLayout.ready);
 const initial=await page.evaluate(()=>({reads:viewportWidthReads,reason:mapLayout.prepared.find(a=>a.id==='detail-0').eligibleReason}));
 expect(initial.reason).toBe('below-detail');expect(initial.reads).toBeLessThan(40);
 if(mode==='interactive'){
  await page.evaluate(async()=>{mapLayout.requestView({x:70,y:70,w:100,h:80});await mapLayout.whenSettled();});
  expect(await page.evaluate(()=>mapLayout.prepared.find(a=>a.id==='detail-0').eligibleReason)).not.toBe('below-detail');
 }
});
for(const mode of ['interactive','static'])test(`${mode} staged SVG is revealed before geometry measurement`,async({page})=>{
 let html=(await fixtureHTML(mode)).replace('id="mapsvg"','id="mapsvg" data-layout-pending=""').replace('"width":500,"height":400,"mode"','"width":500,"height":400,"metersPerMapUnit":30,"mode"');
 html=html.replace('</style>',(await fs.readFile('pipeline/cartography/styles.css','utf8'))+'</style>').replace('<defs>','<g class="roads"><path id="early-road" data-max-mpp="64" d="M10,350 H490" stroke="black"/></g><g class="buildings"><path id="early-building" data-max-mpp="8" d="M200,180 H220 V200 H200 Z" fill="gray"/></g><defs>');
 await page.setContent(html);
 expect(await page.locator('#mapsvg').evaluate(e=>getComputedStyle(e).display)).toBe('none');
 await page.evaluate(()=>{window.hiddenMapMeasurements=0;const original=SVGGraphicsElement.prototype.getScreenCTM;SVGGraphicsElement.prototype.getScreenCTM=function(...args){if(this.id==='mapsvg'&&getComputedStyle(this).display==='none')hiddenMapMeasurements++;return original.apply(this,args);};});
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});await page.evaluate(()=>mapLayout.ready);
 const result=await page.evaluate(()=>({pending:mapLayout.svg.hasAttribute('data-layout-pending'),display:getComputedStyle(mapLayout.svg).display,width:mapLayout.svg.getBoundingClientRect().width,hiddenMeasurements:hiddenMapMeasurements,status:mapLayout.status,road:getComputedStyle(document.getElementById('early-road')).visibility,building:getComputedStyle(document.getElementById('early-building')).visibility}));
 expect(result).toEqual({pending:false,display:'inline',width:500,hiddenMeasurements:0,status:'ready',road:'visible',building:'hidden'});
 if(mode==='interactive'){
  await page.evaluate(async()=>{mapLayout.requestView({x:150,y:140,w:100,h:80});await mapLayout.whenSettled();});
  expect(await page.locator('#early-building').evaluate(e=>getComputedStyle(e).visibility)).toBe('visible');
 }
});
test('early camera input is displayed while initial placement waits and stale work cannot commit',async({page})=>{
 await page.setContent(await fixtureHTML());
 await page.addScriptTag({content:`window.pendingStartup=[];window.holdStartup=true;const NativeWorker=window.Worker;window.Worker=function(...args){const worker=new NativeWorker(...args),send=worker.postMessage.bind(worker);worker.postMessage=(message,...rest)=>{if(window.holdStartup&&message.kind==='solve-initial')window.pendingStartup.push(()=>send(message,...rest));else send(message,...rest);};return worker;};`});
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await expect.poll(()=>page.evaluate(()=>window.pendingStartup.length)).toBe(1);
 await page.evaluate(async()=>{mapLayout.requestView({x:20,y:10,w:400,h:320});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
 expect(await page.locator('#mapsvg').getAttribute('viewBox')).toBe('20 10 400 320');
 expect(await page.evaluate(()=>[...mapLayout.elements.values()].some(e=>e.style.visibility==='visible'))).toBe(false);
 await page.evaluate(()=>{window.holdStartup=false;for(const send of window.pendingStartup.splice(0))send();});
 await page.evaluate(()=>mapLayout.ready);
 const result=await page.evaluate(()=>({view:mapLayout.view,status:mapLayout.status,placed:mapLayout.result.placements.length}));
 expect(result.view).toEqual({x:20,y:10,w:400,h:320});expect(result.status).toBe('ready');expect(result.placed).toBeGreaterThan(0);
});
test('embedded raster relief is reused without startup image encoding',async({page})=>{
 const html=(await fixtureHTML()).replace('<defs>','<image class="terrain" width="500" height="400" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=="/><defs>');
 await page.setContent(html);
 await page.addScriptTag({content:'window.encodes=0;const toBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(...args){window.encodes++;return toBlob.apply(this,args);};'});
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.preview.ready;});
 expect(await page.evaluate(()=>window.encodes)).toBe(0);
 expect(await page.evaluate(()=>!!document.querySelector('#mapsvg > image.terrain'))).toBe(true);
});
test('finishing label computation does not end startup before the preview is ready',async({page})=>{
 await page.setContent(await fixtureHTML());
 await page.addScriptTag({content:`window.pendingStartup=[];window.holdStartup=true;const NativeWorker=window.Worker;window.Worker=function(...args){const worker=new NativeWorker(...args),send=worker.postMessage.bind(worker);worker.postMessage=(message,...rest)=>{if(window.holdStartup&&message.kind==='solve-initial')window.pendingStartup.push(()=>send(message,...rest));else send(message,...rest);};return worker;};`});
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await expect.poll(()=>page.evaluate(()=>pendingStartup.length)).toBe(1);
 await page.evaluate(()=>{mapLayout.preview.ready=new Promise(resolve=>window.releasePreview=resolve);holdStartup=false;pendingStartup.splice(0).forEach(send=>send());});
 await expect.poll(()=>page.evaluate(()=>mapLayout.initialPlacer.pending.size)).toBe(0);
 expect(await page.evaluate(()=>mapLayout.status)).toBe('loading');
 await page.evaluate(async()=>{mapLayout.requestView({x:30,y:20,w:400,h:320});await new Promise(requestAnimationFrame);});
 expect(await page.locator('#mapsvg').getAttribute('viewBox')).toBe('30 20 400 320');
 await page.evaluate(()=>releasePreview());await page.evaluate(()=>mapLayout.ready);
 expect(await page.evaluate(()=>mapLayout.status)).toBe('ready');
});
test('blocked workers preserve eventual initial labels through the fallback',async({page})=>{
 await page.setContent(await fixtureHTML());await page.addScriptTag({content:'window.Worker=function(){throw new Error("Worker blocked for regression");};'});
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});await page.evaluate(()=>mapLayout.ready);
 expect(await page.evaluate(()=>mapLayout.status)).toBe('ready');expect(await page.evaluate(()=>mapLayout.result.placements.length)).toBeGreaterThan(0);
});
test('static initialization retains a caught layout error',async({page})=>{
 const html=(await fixtureHTML('static')).replace('<defs>','<path id="invalid-obstacle" data-layout-obstacle="trail" d="M0,0 C1,1 2,2 3,3"/><defs>');
 await page.setContent(html);await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});await page.evaluate(()=>mapLayout.ready);
 expect(await page.evaluate(()=>mapLayout.status)).toBe('error');
});
test('a required font removed during initial placement cannot commit stale metrics',async({page})=>{
 await page.setContent(await fixtureHTML());
 await page.addScriptTag({content:`window.pendingStartup=[];const NativeWorker=window.Worker;window.Worker=function(...args){const worker=new NativeWorker(...args),send=worker.postMessage.bind(worker);worker.postMessage=(message,...rest)=>window.pendingStartup.push(()=>send(message,...rest));return worker;};`});
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await expect.poll(()=>page.evaluate(()=>pendingStartup.length)).toBe(1);
 await page.evaluate(()=>{window.startupOutcome=mapLayout.ready.then(()=>mapLayout.status,()=>mapLayout.status);for(const style of document.querySelectorAll('style'))style.textContent=style.textContent.replace(/@font-face\s*\{[^}]*\}/g,rule=>rule.includes('Source Sans 3')?'':rule);pendingStartup.splice(0).forEach(send=>send());});
 expect(await page.evaluate(()=>startupOutcome)).toBe('error');
 expect(await page.evaluate(()=>[...mapLayout.elements.values()].some(e=>e.style.visibility==='visible'))).toBe(false);
});
