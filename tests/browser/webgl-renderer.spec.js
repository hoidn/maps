import {test,expect} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import fs from 'node:fs/promises';
async function mount(page){
 const html=(await fixtureHTML()).replace('id="mapsvg"','id="mapsvg" data-renderer="webgl"').replace('<defs>','<g class="contours" fill="none" stroke="red" stroke-width="4" stroke-linejoin="round"><path d="M20,300 250,280 480,300"/></g><defs>');
 await page.setContent(html);await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();});
}
test('WebGL draws persistent vector buffers without uploading on camera frames',async({page,browserName})=>{
 await mount(page);
 const supported=await page.evaluate(()=>!!mapLayout.renderer?.gpu);
 test.skip(!supported&&browserName!=='chromium','WebGL2 is unavailable in this headless engine');
 expect(supported).toBe(true);
 const data=await page.evaluate(async()=>{const l=mapLayout,g=l.renderer.gpu,before=g.uploads;l.beginGesture('pointer');l.requestView({...l.view,x:10,w:400,h:320});await new Promise(requestAnimationFrame);const result={before,after:g.uploads,segments:g.segments,draws:g.drawCalls,error:g.gl.getError()};l.endGesture('pointer');return result;});
 expect(data.segments).toBeGreaterThan(0);expect(data.before).toBeGreaterThan(0);expect(data.after).toBe(data.before);expect(data.draws).toBeGreaterThan(0);expect(data.error).toBe(0);
});
test('WebGL context loss switches to working Canvas contours',async({page})=>{
 await mount(page);
 const supported=await page.evaluate(()=>!!mapLayout.renderer?.gpu?.gl.getExtension('WEBGL_lose_context'));
 test.skip(!supported,'Context loss extension unavailable');
 await page.evaluate(()=>mapLayout.renderer.gpu.gl.getExtension('WEBGL_lose_context').loseContext());
 await expect.poll(()=>page.evaluate(()=>mapLayout.renderer.backend)).toBe('canvas');
 expect(await page.evaluate(()=>({active:mapLayout.renderer.active,context:!!mapLayout.renderer.contourContext,reason:mapLayout.renderer.fallbackReason}))).toMatchObject({active:true,context:true,reason:'WebGL context lost'});
});

test('unavailable WebGL falls back before the first Canvas commit',async({page})=>{
 await page.evaluate(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:get.call(this,type,...args);};});
 await mount(page);
 expect(await page.evaluate(()=>({backend:mapLayout.renderer.backend,active:mapLayout.renderer.active,reason:mapLayout.renderer.fallbackReason,painted:mapLayout.renderer.painted.length>0}))).toEqual({backend:'canvas',active:true,reason:'WebGL2 unavailable',painted:true});
});

test('WebGL contour buffer paints colored pixels',async({page})=>{
 await mount(page);
 const supported=await page.evaluate(()=>!!mapLayout.renderer?.gpu);test.skip(!supported,'WebGL2 unavailable');
 const pixel=await page.evaluate(()=>{const r=mapLayout.renderer,g=r.gpu;r.draw(r.last.result,r.last.m);const out=new Uint8Array(4);g.gl.readPixels(250,119,1,1,g.gl.RGBA,g.gl.UNSIGNED_BYTE,out);return [...out];});
 expect(pixel[0]).toBeGreaterThan(200);expect(pixel[3]).toBeGreaterThan(200);expect(pixel[1]).toBe(0);
});
