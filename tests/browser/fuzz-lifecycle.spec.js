import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {fixtureHTML} from '../support/browser-fixture.js';
import {snapshotPan,assertStablePan,lifecycleBurst,scrollAwayBack} from '../../scripts/fuzz-cartography.mjs';

async function mount(page,backend){
 await page.setContent((await fixtureHTML()).replace('id="mapsvg"',`id="mapsvg" data-renderer="${backend}"`)+
  '<div style="height:2200px">Document scroll fixture</div>');
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();mapLayout.requestView({x:0,y:0,w:400,h:320});await mapLayout.whenSettled();});
}
async function idle(page){await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);await mapLayout.whenSettled();});}

for(const backend of ['svg','canvas']){
 test(`${backend} fuzz pan oracle checks retained ink and permits clipped names`,async({page})=>{
  await mount(page,backend);const before=await page.evaluate(snapshotPan);
  await page.evaluate(()=>mapLayout.requestView({...mapLayout.view,x:2,y:1}));await idle(page);
  const after=await page.evaluate(snapshotPan);expect(assertStablePan(before,after).shared).toBeGreaterThan(0);
  const corrupted=structuredClone(after),id=Object.keys(corrupted.placements).find(id=>before.placements[id]);
  corrupted.placements[id].geometry[0][0]+=1;
  expect(()=>assertStablePan(before,corrupted)).toThrow(/Pan changed geometry/);
  delete after.placements[id];expect(()=>assertStablePan(before,after)).not.toThrow();
 });
 test(`${backend} fuzz interruption changes lifecycle inputs while pointer is held`,async({page})=>{
  await mount(page,backend);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>{window.fuzzCalls=[];for(const method of ['setTextScale','setLayer']){const original=mapLayout[method].bind(mapLayout);mapLayout[method]=(...args)=>{fuzzCalls.push({method,held:mapLayout.gestures.size});return original(...args);};}});
  const action={u:.2,v:.3,w:.4};await lifecycleBurst(page,action);await idle(page);
  const state=await page.evaluate(()=>({calls:fuzzCalls,status:mapLayout.status,gestures:mapLayout.gestures.size,font:mapLayout.textScale,theme:document.documentElement.dataset.theme}));
  expect(action.burst.gestures).toBeGreaterThan(0);expect(action.burst.pending).toBe(true);
  expect(action.burst.viewport).toEqual({width:430,height:900});expect(state.calls.every(c=>c.held>0)).toBe(true);
  expect(state.calls.map(c=>c.method)).toEqual(['setTextScale','setLayer']);
  expect(state).toMatchObject({status:'ready',gestures:0,font:1.5,theme:'dark'});expect(errors).toEqual([]);
 });
 test(`${backend} fuzz scroll leaves and restores a pending preparation frame`,async({page})=>{
  await mount(page,backend);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const action={};await scrollAwayBack(page,action);await idle(page);
  expect(action.scroll.pending).toBe(true);expect(action.scroll.moved).toBe(true);
  expect(action.scroll.returned).toEqual(action.scroll.before);
  const state=await page.evaluate(()=>({status:mapLayout.status,count:mapLayout.visibleIds.size,view:mapLayout.view,painted:mapLayout.renderer?.paintedView??mapLayout.view}));
  expect(state.status).toBe('ready');expect(state.count).toBeGreaterThan(0);expect(state.painted).toEqual(state.view);expect(errors).toEqual([]);
 });
}

test('wide-map interruption releases the real held pointer after shrinking the viewport',async({page})=>{
 await page.setViewportSize({width:1440,height:1200});await mount(page,'canvas');
 await page.locator('.map-wrap').evaluate(e=>e.style.width='100%');
 await page.evaluate(()=>{
  const svg=mapLayout.svg;svg.addEventListener('pointerdown',e=>svg.setPointerCapture(e.pointerId));
  window.fuzzPointerEvents=[];for(const type of ['pointerdown','pointermove','pointerup','lostpointercapture'])window.addEventListener(type,e=>fuzzPointerEvents.push({type,x:e.clientX,y:e.clientY,buttons:e.buttons}),true);
 });
 const action={u:.825389,v:.889399,w:.096817};await lifecycleBurst(page,action);
 const state=await page.evaluate(()=>({gestures:mapLayout.gestures.size,events:fuzzPointerEvents}));
 expect(state.events.find(e=>e.type==='pointerdown').x).toBeGreaterThan(430);
 expect(state.events.some(e=>e.type==='pointermove'&&e.buttons===1&&e.x<430)).toBe(true);
 expect(state.events.some(e=>e.type==='pointerup'&&e.buttons===0&&e.x<430)).toBe(true);
 expect(state.gestures).toBe(0);
 expect(action.burst.release.event.type).toBe('pointerup');
 expect(action.burst.release.event.x).toBeLessThan(430);
 await idle(page);
});
