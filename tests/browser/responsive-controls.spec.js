import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {build} from 'esbuild';
import {fixtureHTML} from '../support/browser-fixture.js';

let bundle,base,css,interaction;
test.beforeAll(async()=>{
 base=await fixtureHTML();
 css=(await fs.readFile('pipeline/cartography/map.css','utf8'))+(await fs.readFile('pipeline/cartography/styles.css','utf8'));
 bundle=(await build({entryPoints:['pipeline/labels/browser.js'],bundle:true,write:false,loader:{'.txt':'text'}})).outputFiles[0].text;
 interaction=await fs.readFile('pipeline/cartography/interactive.js','utf8');
 for(const [key,value] of Object.entries({PROFILE_JSON:'{}',DEM_GW:'1',DEM_GH:'1',DEM_B64:'AAA=',DEM_LON0:'-118.45',DEM_LON1:'-117.42',DEM_LAT0:'34.1',DEM_LAT1:'34.55'}))interaction=interaction.replaceAll(key,value);
});

function html(height,backend,hint){
 const manifest=JSON.parse(base.match(/<script[^>]*map-label-manifest[^>]*>(.*?)<\/script>/s)[1]);
 Object.assign(manifest.map,{width:1300,height,frame:{bbox:[-118.45,34.1,-117.42,34.55]},metersPerMapUnit:72.9169});
 const fonts=base.slice(base.indexOf('<style>')+7,base.indexOf('body{margin:0'));
 const svg=base.match(/<svg\b[\s\S]*?<\/svg>/)[0].replace('data-w="500" data-h="400" viewBox="0 0 500 400"',`data-w="1300" data-h="${height}" data-renderer="${backend}" viewBox="0 0 1300 ${height}"`);
 const controls=`<div class="ctl"><div class="zoomrow"><button id="zin">+</button><button id="zout">−</button><button id="zreset">⌂</button></div><select id="goto" aria-label="Go to a place"></select><details class="layers"><summary>Layers</summary><div class="box">${['relief','landcover','boundaries','water','contours','places','peaks','names','grid'].map(layer=>`<label><input type="checkbox" data-layer="no-${layer}" checked>${layer}</label>`).join('')}<label>Text size<select id="text-size"><option value="1">Standard</option><option value="1.5">Extra large</option></select></label></div></details></div>`;
 return `<meta charset="utf-8"><style>${fonts}${css}</style><main class="sheet"><figure class="map-fig"><div class="map-wrap">${svg}${controls}${hint?'<div class="hint">drag to pan · scroll or pinch to zoom · double-click to zoom in · the link in the address bar remembers this view</div>':''}<div class="zlabel" id="zlabel"></div><div class="readout" id="readout"><small>Cursor</small><br>move over the map for elevation</div><div class="ttip" id="ttip" hidden></div></div><figcaption>Map key</figcaption></figure><div class="map-wrap" id="static-wrapper"><svg class="map" viewBox="0 0 1300 ${height}"></svg></div></main><script type="application/json" id="map-label-manifest">${JSON.stringify(manifest)}</script>`;
}

for(const [name,height,hint] of [['regional',685,false],['authored',1070,true]])for(const backend of ['svg','canvas','webgl'])test(`${name} narrow controls preserve ${backend} map bounds and camera`,async({page},info)=>{
 await page.setViewportSize({width:1440,height:1200});await page.setContent(html(height,backend,hint));await page.addScriptTag({content:bundle});await page.evaluate(()=>mapLayout.whenSettled());await page.addScriptTag({content:interaction});
 const view={x:10,y:10,w:650,h:height/2};
 await page.evaluate(async view=>{mapLayout.requestView(view);await mapLayout.whenSettled();},view);
 const read=()=>page.evaluate(()=>{
  const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const selectors=['.ctl','.live-scale','.zlabel','.readout','.hint'],boxes=selectors.flatMap(selector=>{const e=document.querySelector(selector);return e&&getComputedStyle(e).display!=='none'?[{selector,...rect(e)}]:[]});
  return {view:mapLayout.view,anchors:mapLayout.manifest.annotations.map(a=>a.anchor),svg:rect(mapLayout.svg),canvas:[...document.querySelectorAll('[data-map-canvas]')].map(rect),boxes,controlPosition:getComputedStyle(document.querySelector('.ctl')).position,staticDisplay:getComputedStyle(document.getElementById('static-wrapper')).display,backend:mapLayout.renderer?.backend??'svg',fallback:mapLayout.renderer?.fallbackReason};
 });
 const desktop=await read();expect(desktop.controlPosition).toBe('absolute');expect(desktop.boxes[0].y-desktop.svg.y).toBeCloseTo(12);expect(desktop.svg.right-desktop.boxes[0].right).toBeCloseTo(12);
 await page.setViewportSize({width:430,height:1200});await page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await mapLayout.whenSettled();});
 await page.locator('#mapsvg').hover({position:{x:300,y:130}});
 const narrow=await read();info.annotations.push({type:'actual-renderer',description:narrow.backend+(narrow.fallback?' ('+narrow.fallback+')':'')});
 expect(narrow.view).toEqual(view);expect(narrow.anchors).toEqual(desktop.anchors);expect(narrow.staticDisplay).toBe('block');expect(Math.abs(narrow.svg.height-narrow.svg.width*height/1300)).toBeLessThan(.02);
 if(backend==='svg')expect(narrow.canvas).toHaveLength(0);else{expect(narrow.canvas).toHaveLength(3);expect(narrow.backend).toMatch(/^(canvas|webgl)$/);if(backend==='webgl'&&narrow.backend!=='webgl')expect(narrow.fallback).toBeTruthy();}
 for(const state of [desktop,narrow])for(const canvas of state.canvas)for(const key of ['x','y','width','height'])expect(canvas[key],`${state===narrow?'narrow':'desktop'} canvas ${key}`).toBeCloseTo(state.svg[key],2);
 const overlaps=[];
 for(let i=0;i<narrow.boxes.length;i++)for(const b of narrow.boxes.slice(i+1)){const a=narrow.boxes[i];if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>.5)overlaps.push([a.selector,b.selector]);}
 expect(overlaps).toEqual([]);
 for(const b of narrow.boxes){expect(b.x,b.selector).toBeGreaterThanOrEqual(0);expect(b.right,b.selector).toBeLessThanOrEqual(430);}
 if(name==='regional'&&backend==='canvas'&&info.project.name==='chromium')await page.screenshot({path:info.outputPath('narrow-controls.png')});
 await page.locator('.layers summary').click();await expect(page.locator('.layers')).toHaveAttribute('open','');
 const relief=page.locator('.layers input[data-layer="no-relief"]');await relief.uncheck();await expect(page.locator('#mapsvg')).toHaveClass(/no-relief/);await relief.check();
 if(name==='regional'&&backend==='canvas'&&info.project.name==='chromium')await page.screenshot({path:info.outputPath('narrow-layers-open.png')});
 await page.locator('.layers summary').click();await page.evaluate(()=>mapLayout.whenSettled());expect((await read()).view).toEqual(view);
});
