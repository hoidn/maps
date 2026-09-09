import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {fixtureHTML} from '../support/browser-fixture.js';
async function mount(page,backend,initialZoom=1,{curvedFine=false}={}){
 const bundle=await build({stdin:{contents:"import {LayoutController} from './pipeline/labels/runtime.js';import {ContourPreview} from './pipeline/labels/contour-preview.js';import policy from './pipeline/labels/policy.json';window.tierFixture={LayoutController,ContourPreview,policy};",resolveDir:process.cwd()},bundle:true,write:false,loader:{'.txt':'text'}});
 const contours=('<g class="contours" fill="none" stroke-width="4" stroke-linejoin="round"><g class="g-finest"><path stroke="green" d="M10,20 90,20"/></g><g class="g-fine"><path stroke="blue" d="M10,40 90,40"/></g><path stroke="red" d="M10,60 90,60"/></g>').replace('M10,40 90,40',curvedFine?'M10,40 Q50,40 90,40':'M10,40 90,40');
 await page.setContent((await fixtureHTML()).replace('id="mapsvg"',`id="mapsvg" data-renderer="${backend}"`).replace('<defs>',contours+'<defs>'));
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.evaluate(initialZoom=>{
  const {ContourPreview,LayoutController,policy}=tierFixture,prepare=ContourPreview.prototype.preparePath;window.fineHeld=false;window.releaseFine=null;
  ContourPreview.prototype.preparePath=function(entry){if(entry.minZoom===2&&!fineHeld){fineHeld=true;return new Promise(resolve=>{releaseFine=()=>resolve(prepare.call(this,entry));});}return prepare.call(this,entry);};
  window.mapLayout=new LayoutController(document.getElementById('mapsvg'),JSON.parse(document.getElementById('map-label-manifest').textContent),policy);
  if(initialZoom!==1)mapLayout.requestView({x:0,y:0,w:500/initialZoom,h:400/initialZoom});
  window.tierIdle=false;mapLayout.whenSettled().then(()=>{tierIdle=true;});
 },initialZoom);
 await page.waitForFunction(()=>fineHeld&&releaseFine);
 await page.evaluate(async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
}
for(const backend of ['canvas','webgl']){
 test(`${backend} complete coarse geometry paints before hidden fine tiers and zoom never claims missing detail`,async({page})=>{
  await mount(page,backend);
  const coarse=await page.evaluate(()=>{const l=mapLayout,r=l.renderer;let pixel;if(r.last){r.draw(r.last.result,r.last.m);if(r.gpu){const bytes=new Uint8Array(4),gl=r.gpu.gl;gl.readPixels(50,r.contourCanvas.height-60,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);pixel=[...bytes];}else pixel=[...r.contourContext.getImageData(50,60,1,1).data];}return {pixel,active:r.active,view:r.paintedView,idle:tierIdle,tiers:l.preview.contours.items.map(i=>i.minZoom),gpu:r.gpu?.groups.map(g=>g.minZoom)};});
  expect(coarse.active).toBe(true);expect(coarse.pixel).toEqual([255,0,0,255]);expect(coarse.view).toEqual({x:0,y:0,w:500,h:400});expect(coarse.idle).toBe(false);expect(coarse.tiers).toEqual([0]);if(coarse.gpu)expect(coarse.gpu).toEqual([0]);
  await page.evaluate(async()=>{mapLayout.requestView({x:0,y:0,w:100,h:80});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
  expect(await page.evaluate(()=>mapLayout.renderer.paintedView)).toEqual(coarse.view);
  expect(await page.evaluate(()=>tierIdle)).toBe(false);
  await page.evaluate(async()=>{releaseFine();await mapLayout.whenSettled();});
  const final=await page.evaluate(()=>{const l=mapLayout,r=l.renderer;r.draw(r.last.result,r.last.m);const pixels=[100,200,300].map(y=>{if(r.gpu){const bytes=new Uint8Array(4),gl=r.gpu.gl;gl.readPixels(250,r.contourCanvas.height-y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes);return [...bytes];}return [...r.contourContext.getImageData(250,y,1,1).data];});return {pixels,view:l.view,painted:r.paintedView,revision:l.revision,paintedRevision:r.paintedRevision,tiers:l.preview.contours.items.map(i=>i.minZoom),pending:r.geometryPending,status:l.status};});
  expect(final.pixels).toEqual([[0,128,0,255],[0,0,255,255],[255,0,0,255]]);expect(final.painted).toEqual(final.view);expect(final.paintedRevision).toBe(final.revision);expect(final.tiers).toEqual([4.5,2,0]);expect(final.pending).toBe(0);expect(final.status).toBe('ready');
 });
 test(`${backend} initial deep camera waits for every visible contour tier`,async({page})=>{
  await mount(page,backend,5);
  expect(await page.evaluate(()=>!!mapLayout.renderer.paintedView)).toBe(false);
  expect(await page.evaluate(()=>tierIdle)).toBe(false);
  await page.evaluate(async()=>{releaseFine();await mapLayout.whenSettled();});
  expect(await page.evaluate(()=>mapLayout.renderer.paintedView)).toEqual({x:0,y:0,w:100,h:80});
  expect(await page.evaluate(()=>mapLayout.preview.contours.items.length)).toBe(3);
 });
}

test('a newly requested unsupported WebGL tier falls back to complete Canvas geometry',async({page})=>{
 await mount(page,'webgl',1,{curvedFine:true});
 expect(await page.evaluate(()=>mapLayout.renderer.active)).toBe(true);
 await page.evaluate(async()=>{mapLayout.requestView({x:0,y:0,w:100,h:80});releaseFine();await mapLayout.whenSettled();});
 const result=await page.evaluate(()=>{const r=mapLayout.renderer;return {backend:r.backend,fallback:r.fallbackReason,view:r.paintedView,pending:r.geometryPending,pixel:[...r.contourContext.getImageData(250,200,1,1).data]};});
 expect(result.backend).toBe('canvas');expect(result.fallback).toContain('solid round-joined contour polylines');expect(result.view).toEqual({x:0,y:0,w:100,h:80});expect(result.pending).toBe(0);expect(result.pixel).toEqual([0,0,255,255]);
});
test('layer and theme changes during fine preparation remain pending and preserve late-tier ink',async({page})=>{
 await mount(page,'webgl');
 await page.addStyleTag({content:':root[data-theme="dark"] .g-fine path{stroke:rgb(255,0,255)}'});
 await page.evaluate(async()=>{document.documentElement.dataset.theme='dark';mapLayout.setLayer('contours',false);mapLayout.requestView({x:0,y:0,w:100,h:80});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
 expect(await page.evaluate(()=>tierIdle)).toBe(false);
 await page.evaluate(async()=>{releaseFine();await mapLayout.whenSettled();mapLayout.setLayer('contours',true);await mapLayout.whenSettled();});
 const result=await page.evaluate(()=>{const r=mapLayout.renderer;r.draw(r.last.result,r.last.m);const pixel=new Uint8Array(4);if(r.gpu){const gl=r.gpu.gl;gl.readPixels(250,r.contourCanvas.height-200,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);}else pixel.set(r.contourContext.getImageData(250,200,1,1).data);return {pixel:[...pixel],pending:r.geometryPending,refresh:r.refreshPending,view:r.paintedView};});
 expect(result.pixel).toEqual([255,0,255,255]);expect(result.pending).toBe(0);expect(result.refresh).toBe(0);expect(result.view).toEqual({x:0,y:0,w:100,h:80});
});
