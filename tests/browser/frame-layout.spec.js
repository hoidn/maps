import {test,expect} from '@playwright/test';
import {mountFixture,fixtureHTML} from '../support/browser-fixture.js';
import fs from 'node:fs/promises';
import {collectLegacyInventory} from '../support/legacy-map-adapter.js';
import {checkInventory} from '../support/reference-geometry.js';
async function installAudit(page){await page.addScriptTag({content:'window.independentInventory='+collectLegacyInventory.toString()});}
test('every displayed frame stays valid across camera reversals and resize',async({page})=>{
 await mountFixture(page);
 await installAudit(page);
 const frames=await page.evaluate(async()=>{
  const frames=[];
  for(let i=0;i<120;i++){
   const z=1+Math.abs(Math.sin(i*.21))*5;
   window.mapLayout.requestView({x:50*Math.abs(Math.sin(i*.13)),y:30,w:500/z,h:400/z});
   await new Promise(requestAnimationFrame);
   frames.push(window.independentInventory());
  }return frames;
 });
 for(const frame of frames){const report=checkInventory(frame.inventory,frame.viewport);expect(report.overlaps).toEqual([]);expect(report.clipped).toEqual([]);}
 await page.setViewportSize({width:360,height:800});await page.evaluate(()=>window.mapLayout.whenSettled());
 expect((await page.evaluate(()=>window.mapLayout.getReport())).status).toBe('ready');
});
test('camera changes preserve hinted glyph metrics without an intermediate scale',async({page,browserName})=>{
 test.skip(browserName!=='firefox','Regression in Firefox font shaping after an intermediate zoom flush');
 await mountFixture(page);
 const sizes=await page.evaluate(async()=>{
  const out=[];
  for(const z of [1,2.806006849146262,1.7943989227326704,2.727357756822622,1.7112849774220407]){
   window.mapLayout.requestView({x:0,y:0,w:500/z,h:400/z});await new Promise(requestAnimationFrame);
   const t=document.querySelector('#label-0 text'),r=t.getBBox(),m=t.getScreenCTM();out.push({width:r.width*Math.hypot(m.a,m.b),height:r.height*Math.hypot(m.c,m.d)});
  }return out;
 });
 for(const size of sizes){expect(size.width).toBeCloseTo(sizes[0].width,2);expect(size.height).toBeCloseTo(sizes[0].height,2);}
});
test('independent frame audit detects a deliberately defective painted frame',async({page})=>{
 await mountFixture(page);await installAudit(page);
 const frame=await page.evaluate(async()=>{
  window.mapLayout.observer.disconnect();clearTimeout(window.mapLayout.settleTimer);cancelAnimationFrame(window.mapLayout.frame);cancelAnimationFrame(window.mapLayout.quietFrame);window.mapLayout.settleGeneration++;
  for(const e of document.querySelectorAll('#label-0,#label-1')){e.style.visibility='visible';e.style.display='inline';e.setAttribute('transform','');e.querySelector('text').setAttribute('style','transform:translate(100px,100px)');}
  await new Promise(requestAnimationFrame);return window.independentInventory();
 });
 expect(checkInventory(frame.inventory,frame.viewport).overlaps.length).toBeGreaterThan(0);
});
test('gesture defers fresh optional enumeration and resize completes a settled pass',async({page})=>{
 await mountFixture(page);
 const frame=await page.evaluate(async()=>{window.mapLayout.requestView({x:10,y:0,w:400,h:320});await new Promise(requestAnimationFrame);return {kind:window.mapLayout.transactionKind,max:Math.max(...window.mapLayout.prepared.map(a=>a.candidates.length))};});
 expect(frame.kind).toBe('fast');expect(frame.max).toBeLessThanOrEqual(1);
 await page.setViewportSize({width:360,height:800});
 await page.waitForTimeout(150);
 expect(await page.evaluate(()=>window.mapLayout.transactionKind)).toBe('settled');
 await page.evaluate(()=>window.mapLayout.setLayer('places',false));await page.evaluate(()=>window.mapLayout.whenSettled());
 expect(await page.evaluate(()=>[...document.querySelectorAll('#label-0,#label-1')].every(e=>getComputedStyle(e).display==='none'))).toBe(true);
});
test('delayed fonts keep labels hidden and the latest queued view wins',async({page})=>{
 const html=await fixtureHTML();let release;
 const pending=new Promise(resolve=>{release=resolve;});
 const font=(await fs.readFile('pipeline/labels/fonts/b6f2cc8d9905e97b.ttf'));
 await page.route('https://font.test/delayed.ttf',async route=>{await pending;await route.fulfill({body:font,contentType:'font/ttf',headers:{'access-control-allow-origin':'*'}});});
 await page.setContent(html.replace(/url\(data:font\/ttf;base64,[^)]+\)/g,'url(https://font.test/delayed.ttf)'),{waitUntil:'domcontentloaded'});
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(()=>{window.mapLayout.requestView({x:0,y:0,w:250,h:200});window.mapLayout.requestView({x:20,y:10,w:200,h:160});});
 expect(await page.evaluate(()=>[...document.querySelectorAll('[data-layout-id]')].some(e=>getComputedStyle(e).visibility==='visible'))).toBe(false);
 release();await page.evaluate(()=>window.mapLayout.ready);
 expect(await page.evaluate(()=>window.mapLayout.getReport().view)).toEqual({x:20,y:10,w:200,h:160});
 expect(await page.evaluate(()=>window.mapLayout.status)).toBe('ready');
});
test('a required font failing after initialization prevents fallback labels',async({page})=>{
 await mountFixture(page);
 await page.evaluate(async()=>{
  // CSS-connected faces cannot be deleted through FontFaceSet in every engine.
  // Replace the actual required declarations so this really removes the font.
  for(const style of document.querySelectorAll('style'))style.textContent=style.textContent.replace(/@font-face\s*\{[^}]*\}/g,rule=>rule.includes('Source Sans 3')?'':rule);
  const broken=document.createElement('style');broken.textContent='@font-face {font-family:"Source Sans 3";src:url(data:font/ttf;base64,AAAA)}';document.head.append(broken);
  try{await document.fonts.load('12px "Source Sans 3"');}catch{}
 });
 await expect.poll(()=>page.evaluate(()=>window.mapLayout.status)).toBe('error');
 expect(await page.evaluate(()=>[...document.querySelectorAll('[data-layout-id]')].some(e=>getComputedStyle(e).visibility==='visible'&&getComputedStyle(e).display!=='none'))).toBe(false);
});
test('the lazy trail query projects only nearby segment bounds from a shared cell',async({page})=>{
 const html=(await fixtureHTML()).replace('<defs>','<g class="trails"><path id="near" d="M1,1 L3,1" stroke="black" fill="none"/><path id="far" d="M20,20 L25,20" stroke="black" fill="none"/></g><defs>');
 await page.setContent(html.replaceAll('id="near"','data-layout-obstacle="trail" id="near"').replaceAll('id="far"','data-layout-obstacle="trail" id="far"'));
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});await page.evaluate(()=>window.mapLayout.ready);
 const ids=await page.evaluate(()=>{const l=window.mapLayout;return l.trailQuery(l.svg.getScreenCTM(),1,1)({x:0,y:0,width:4,height:4}).map(o=>o.id);});
 expect(ids).toEqual(['near:1']);
});

test('motion preview is bounded, preserves vector annotations, and restores source layers',async({page})=>{
 const html=(await fixtureHTML()).replace('<defs>','<g class="roads"><path id="preview-road" d="M0,10 L400,10" stroke="black"/></g><defs>');
 await page.setContent(html);await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(()=>window.mapLayout.ready);
 await page.evaluate(()=>window.mapLayout.preview.ready);
 const during=await page.evaluate(async()=>{const l=window.mapLayout;l.requestView({...l.view,w:400,h:320});await new Promise(requestAnimationFrame);return {active:l.preview.active,bytes:l.preview.rgbaBytes,road:!!document.getElementById('preview-road'),vectors:document.querySelectorAll('[data-layout-id]').length,image:!!document.querySelector('[data-layout-preview]')};});
 expect(during.active).toBe(true);expect(during.bytes).toBeLessThanOrEqual(24*1024*1024);expect(during.road).toBe(false);expect(during.vectors).toBeGreaterThan(0);expect(during.image).toBe(true);
 await page.evaluate(()=>window.mapLayout.whenSettled());
 expect(await page.evaluate(()=>({active:window.mapLayout.preview.active,road:!!document.getElementById('preview-road')}))).toEqual({active:false,road:true});
});

test('preview invalidation discards stale async work and failure restores the vector background',async({page})=>{
 const html=(await fixtureHTML()).replace('<defs>','<g class="roads"><path id="preview-road" d="M0,10 L400,10" stroke="black"/></g><defs>');
 await page.setContent(html);await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});await page.evaluate(()=>window.mapLayout.ready);
 const result=await page.evaluate(async()=>{
  const l=window.mapLayout,p=l.preview;await p.ready;p.show();
  const stale=p.invalidate();p.destroy();await stale;
  const cancelled={active:p.active,url:p.url,road:!!document.getElementById('preview-road')};
  const decode=Image.prototype.decode;Image.prototype.decode=()=>Promise.reject(new Error('decode fixture failure'));
  await p.invalidate();Image.prototype.decode=decode;p.show();
  return {cancelled,failed:!!p.error,active:p.active,road:!!document.getElementById('preview-road')};
 });
 expect(result).toEqual({cancelled:{active:false,url:null,road:true},failed:true,active:false,road:true});
});

test('settled point metric caches match the actual current screen scale',async({page})=>{
 await mountFixture(page);
 const values=await page.evaluate(async()=>{const l=window.mapLayout;await l.whenSettled();l.requestView({...l.view,w:333.3,h:266.64});await l.whenSettled();return {scale:Math.hypot(l.svg.getScreenCTM().a,l.svg.getScreenCTM().b),entries:[...l.cache.entries.values()].map(c=>c.scale)};});
 expect(values.entries.length).toBeGreaterThan(0);for(const scale of values.entries)expect(scale).toBeCloseTo(values.scale,10);
});

test('preview pixels track theme and layer changes without rasterizing labels',async({page})=>{
 const html=(await fixtureHTML()).replace('<defs>','<g class="hydro"><rect x="0" y="0" width="500" height="400" fill="var(--preview-paint)"/></g><defs>');
 await page.setContent(html);await page.addStyleTag({content:':root{--preview-paint:rgb(255,0,0)}:root[data-theme="dark"]{--preview-paint:rgb(0,0,255)}.no-water .hydro{display:none}'});await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});await page.evaluate(()=>window.mapLayout.ready);
 const colors=await page.evaluate(async()=>{
  const l=window.mapLayout;async function pixel(){await l.preview.ready;const image=new Image();image.src=l.preview.url;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;canvas.getContext('2d').drawImage(image,0,0,1,1);return [...canvas.getContext('2d').getImageData(0,0,1,1).data];}
  const light=await pixel();document.documentElement.dataset.theme='dark';await new Promise(requestAnimationFrame);const dark=await pixel();l.setLayer('water',false);await l.whenSettled();const off=await pixel();return {light,dark,off};
 });
 expect(colors.light).toEqual([255,0,0,255]);expect(colors.dark).toEqual([0,0,255,255]);expect(colors.off[3]).toBe(0);
});

test('settlement waits for quiet frames without running full passes inside a gesture',async({page})=>{
 await mountFixture(page);
 const result=await page.evaluate(async()=>{const l=window.mapLayout;await l.whenSettled();const begin=l.samples.length;for(let i=0;i<30;i++){l.requestView({...l.view,x:i%4,w:400,h:320});await new Promise(requestAnimationFrame);}const during=l.samples.slice(begin).filter(s=>s.kind==='settled').length;await l.whenSettled();return {during,after:l.samples.at(-1).kind};});
 expect(result).toEqual({during:0,after:'settled'});
});

test('an empty retained set updates the camera without querying unused collision geometry',async({page})=>{
 await mountFixture(page);
 const result=await page.evaluate(async()=>{const l=window.mapLayout;await l.whenSettled();l.previous={placements:[],outcomes:[],missingRequired:[]};for(const e of l.elements.values()){e.style.display='none';e.style.visibility='hidden';}l.visibleIds.clear();let queries=0;const controls=l.controls.bind(l);l.controls=()=>{queries++;return controls();};l.requestView({...l.view,w:400,h:320});await new Promise(requestAnimationFrame);const result={queries,kind:l.transactionKind,placed:l.result.placements.length,accounted:l.result.outcomes.length,total:l.manifest.annotations.length};l.controls=controls;return result;});
 expect(result).toEqual({queries:0,kind:'fast',placed:0,accounted:3,total:3});
});

test('budget-deferred lines never enter the normalization and measurement batch',async({page})=>{
 await mountFixture(page);
 const result=await page.evaluate(async()=>{const l=window.mapLayout;await l.whenSettled();l.policy.interactiveCandidateBudgetMs=0;l.cache.invalidate();l.lineCache.clear();let lineCalls=0;const normalize=l.normalize.bind(l);l.normalize=(a,...args)=>{if(a.kind==='line-label')lineCalls++;return normalize(a,...args);};l.render(true);return {lineCalls,reason:l.result.outcomes.find(o=>o.id==='curve').reason};});
 expect(result).toEqual({lineCalls:0,reason:'budget-deferred'});
});

test('a mixed background group keeps its vector annotation in the live SVG',async({page})=>{
 await mountFixture(page);
 const connected=await page.evaluate(async()=>{const l=window.mapLayout;await l.preview.ready;document.querySelector('.labels').classList.add('roads');await l.preview.invalidate();l.preview.show();return document.getElementById('label-0')?.isConnected===true;});
 expect(connected).toBe(true);
});
