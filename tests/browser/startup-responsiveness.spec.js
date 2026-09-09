import {test,expect} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import fs from 'node:fs/promises';
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
