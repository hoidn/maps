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
  window.mapLayout.observer.disconnect();clearTimeout(window.mapLayout.settleTimer);cancelAnimationFrame(window.mapLayout.frame);
  for(const e of document.querySelectorAll('#label-0,#label-1')){e.style.visibility='visible';e.setAttribute('transform','');e.querySelector('text').setAttribute('style','transform:translate(100px,100px)');}
  await new Promise(requestAnimationFrame);return window.independentInventory();
 });
 expect(checkInventory(frame.inventory,frame.viewport).overlaps.length).toBeGreaterThan(0);
});
test('gesture defers fresh optional enumeration and resize completes a settled pass',async({page})=>{
 await mountFixture(page);
 await page.evaluate(async()=>{window.mapLayout.requestView({x:10,y:0,w:400,h:320});await new Promise(requestAnimationFrame);});
 const frame=await page.evaluate(()=>({kind:window.mapLayout.transactionKind,max:Math.max(...window.mapLayout.prepared.map(a=>a.candidates.length))}));
 expect(frame.kind).toBe('fast');expect(frame.max).toBeLessThanOrEqual(1);
 await page.setViewportSize({width:360,height:800});
 await page.waitForTimeout(150);
 expect(await page.evaluate(()=>window.mapLayout.transactionKind)).toBe('settled');
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
