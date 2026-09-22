import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {fixtureHTML} from '../support/browser-fixture.js';
import {collectManagedInventory,checkManagedInventory} from '../support/managed-map-adapter.js';

let bundle,interaction;
test.beforeAll(async()=>{
 bundle=(await build({stdin:{contents:"import './pipeline/labels/browser.js';import {captureCommands} from './pipeline/render/scene.js';import {measureElement} from './pipeline/labels/measure.js';window.inputTargetTest={captureCommands,measureElement};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',loader:{'.txt':'text'}})).outputFiles[0].text;
 interaction=(await readFile('pipeline/cartography/interactive.js','utf8')).replace('PROFILE_JSON','{}').replaceAll('DEM_GW','2').replaceAll('DEM_GH','2').replaceAll('DEM_B64','AAAAAAAAAAA=').replaceAll('DEM_LON0','-118').replaceAll('DEM_LON1','-117').replaceAll('DEM_LAT0','34').replaceAll('DEM_LAT1','35');
});
async function mount(page){
 let html=(await fixtureHTML()).replace('id="mapsvg"','id="mapsvg" data-renderer="canvas"').replace('<defs>','<g class="terrain"><rect width="500" height="400" fill="#eee"/></g><g class="trails"><path id="trail" class="tr" data-name="Fixture Trail" data-cls="corridor" data-mi="2" d="M20,300L480,300" fill="none" stroke="red" stroke-width="2"/></g><g class="hits"><path class="hit" data-name="Fixture Trail" data-cls="corridor" d="M20,300L480,300" fill="none" stroke="transparent" stroke-width="14"/></g><defs>');
 html=html.replace('>Controls</div>','><button id="zin">+</button><button id="zout">−</button><button id="zreset">⌂</button></div>')+'<select id="goto"></select><div id="readout"></div><div id="ttip" hidden></div><style>.hit{pointer-events:stroke}:root[data-theme="dark"] .tr{stroke:blue}</style>';
 await page.setContent(html);await page.addScriptTag({content:bundle});await page.addScriptTag({content:interaction});await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();});
}

test('accelerated input hits one owned rectangle and preserves wheel, pan, hover and controls',async({page})=>{
 await mount(page);
 expect(await page.evaluate(()=>document.elementFromPoint(250,300)?.hasAttribute('data-map-hit-target'))).toBe(true);
 await page.evaluate(()=>{window.inputEvents=[];for(const type of ['wheel','pointerdown','pointerup'])mapLayout.svg.addEventListener(type,e=>inputEvents.push({type,target:e.target.hasAttribute('data-map-hit-target'),current:e.currentTarget===mapLayout.svg}));});
 await page.mouse.move(250,300);await expect(page.locator('[data-layout-details]')).toContainText('Fixture Trail');
 await page.mouse.click(250,300);await page.mouse.move(250,200);expect(await page.evaluate(()=>[...mapLayout.renderer.highlighted])).toEqual(['trail']);
 await page.mouse.click(250,300);await page.mouse.move(250,200);expect(await page.evaluate(()=>mapLayout.renderer.highlighted)).toBeNull();
 await page.mouse.wheel(0,-140);await page.evaluate(()=>mapLayout.whenSettled());
 const zoomed=await page.evaluate(()=>({...mapLayout.view}));expect(zoomed.w).toBeLessThan(500);
 await page.mouse.move(250,200);await page.mouse.down();await page.mouse.move(280,210,{steps:3});await page.mouse.up();await page.evaluate(()=>mapLayout.whenSettled());
 const panned=await page.evaluate(()=>({...mapLayout.view}));expect(panned.w).toBe(zoomed.w);expect(panned.x).toBeLessThan(zoomed.x);
 const events=await page.evaluate(()=>inputEvents);expect(events.find(e=>e.type==='wheel')).toEqual({type:'wheel',target:true,current:true});expect(events.find(e=>e.type==='pointerdown')).toEqual({type:'pointerdown',target:true,current:true});expect(events.some(e=>e.type==='pointerup'&&e.current)).toBe(true);
 await page.locator('#zreset').click();await page.evaluate(()=>mapLayout.whenSettled());expect(await page.evaluate(()=>mapLayout.view.w)).toBe(500);
 await page.evaluate(async()=>{mapLayout.renderer.fallback(new Error('Intentional fallback'));await mapLayout.whenSettled();});
 expect(await page.locator('[data-map-hit-target]').count()).toBe(0);expect(await page.evaluate(()=>mapLayout.svg.style.opacity)).toBe('');
 await page.mouse.move(200,300);await expect(page.locator('[data-layout-details]')).toContainText('Fixture Trail');
 expect(await page.evaluate(()=>document.elementFromPoint(200,300)?.classList.contains('hit'))).toBe(true);
});

test('owned input geometry preserves native measurements, painted output and theme recapture',async({page})=>{
 await mount(page);expect(await page.locator('[data-map-hit-target]').count()).toBe(1);
 await page.evaluate(async()=>{document.querySelector('.map-wrap').style.cssText='position:relative;width:623.375px;margin-top:170px';document.body.style.minHeight='1800px';scrollTo(0,125);mapLayout.requestView({x:7.25,y:9.5,w:401.375,h:321.1});await mapLayout.whenSettled();});
 const native=()=>{
  const l=mapLayout,{captureCommands,measureElement}=inputTargetTest;
  return ['trail','waterpath','label-0','label-1','curve'].map(id=>{const e=document.getElementById(id),b=e.getBBox(),m=e.getScreenCTM();return{id,bounds:[b.x,b.y,b.width,b.height],matrix:['a','b','c','d','e','f'].map(k=>m[k]),commands:captureCommands(e,l.svg).map(({path,group,...command})=>command),...(e.hasAttribute('data-layout-id')?{metric:measureElement(e,0,{canvasInk:true})}:{})};});
 };
 const before=await page.evaluate(native),paint=await page.screenshot(),audit=await page.evaluate(collectManagedInventory);
 await page.evaluate(()=>{window.removedInputTarget=mapLayout.svg.querySelector('[data-map-hit-target]');removedInputTarget.remove();});
 expect(await page.evaluate(native)).toEqual(before);expect((await page.screenshot()).equals(paint)).toBe(true);
 expect(checkManagedInventory(await page.evaluate(collectManagedInventory))).toEqual(checkManagedInventory(audit));
 await page.evaluate(async()=>{mapLayout.svg.append(removedInputTarget);document.documentElement.dataset.theme='dark';await new Promise(requestAnimationFrame);await mapLayout.whenSettled();});
 const refreshed=await page.evaluate(()=>({ownedItems:mapLayout.renderer.scene.items.filter(i=>i.element.hasAttribute('data-map-hit-target')).length,trailStroke:mapLayout.renderer.scene.items.find(i=>i.element.id==='trail').commands[0].style.stroke,target:document.elementFromPoint(250,300)?.hasAttribute('data-map-hit-target'),rectangles:document.querySelectorAll('[data-map-hit-target]').length}));
 expect(refreshed).toEqual({ownedItems:0,trailStroke:'rgb(0, 0, 255)',target:true,rectangles:1});
 await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false})));expect(await page.locator('[data-map-hit-target]').count()).toBe(0);
});
