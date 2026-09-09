import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {fixtureHTML} from '../support/browser-fixture.js';
let bundle;
test.beforeAll(async()=>{
 const worker=(await build({entryPoints:['pipeline/labels/initial-placement-worker.js'],bundle:true,format:'iife',write:false})).outputFiles[0].text;
 bundle=(await build({entryPoints:['pipeline/labels/browser.js'],bundle:true,format:'iife',write:false,plugins:[{name:'current-worker',setup(b){b.onLoad({filter:/initial-worker\.txt$/},()=>({contents:worker,loader:'text'}));}}]})).outputFiles[0].text;
});
for(const renderer of ['svg','canvas'])test(`${renderer} reuses complete failures within rounds and retries after controls change`,async({page})=>{
 const html=(await fixtureHTML()).replace('id="mapsvg"',`id="mapsvg" data-renderer="${renderer}"`);
 await page.setContent(html);
 await page.evaluate(()=>{
  document.querySelector('.ctl').style.cssText='position:absolute;left:0;top:0;width:500px;height:400px';
  window.roundMessages=[];const post=Worker.prototype.postMessage;
  Worker.prototype.postMessage=function(message,...rest){
   roundMessages.push(message.payload.annotations.map(a=>({id:a.id,reason:a.eligibleReason,cached:a.cachedFailure,candidates:a.candidates.length})));
   return post.call(this,message,...rest);
  };
 });
 await page.addScriptTag({content:bundle});await page.evaluate(()=>mapLayout.whenSettled());
 const blocked=await page.evaluate(()=>({messages:roundMessages,outcome:mapLayout.result.outcomes.find(o=>o.id==='label-0')}));
 expect(blocked.messages.length).toBeGreaterThanOrEqual(4);
 const cached=blocked.messages.flatMap(m=>m).filter(a=>a.id==='label-0'&&a.cached);
 expect(cached.length).toBeGreaterThanOrEqual(2);expect(cached.every(a=>a.candidates===0)).toBe(true);
 expect(cached.every(a=>JSON.stringify(a.cached)===JSON.stringify(blocked.outcome))).toBe(true);
 const after=await page.evaluate(async()=>{
  roundMessages=[];document.querySelector('.ctl').remove();mapLayout.requestView({...mapLayout.view});await mapLayout.whenSettled();
  return {messages:roundMessages,placed:mapLayout.result.placements.some(p=>p.id==='label-0'),status:mapLayout.status};
 });
 expect(after.status).toBe('ready');expect(after.placed).toBe(true);expect(after.messages[0].find(a=>a.id==='label-0').cached).toBeUndefined();
});
test('font changes start a fresh failure token instead of retaining old geometry conclusions',async({page})=>{
 await page.setContent(await fixtureHTML());await page.evaluate(()=>{document.querySelector('.ctl').style.cssText='position:absolute;left:0;top:0;width:500px;height:400px';});await page.addScriptTag({content:bundle});await page.evaluate(()=>mapLayout.whenSettled());
 const result=await page.evaluate(async()=>{
  const messages=[],post=Worker.prototype.postMessage;Worker.prototype.postMessage=function(message,...rest){messages.push(message.payload.annotations.map(a=>({id:a.id,cached:!!a.cachedFailure})));return post.call(this,message,...rest);};
  mapLayout.setTextScale(1.5);await mapLayout.whenSettled();return {first:messages[0].find(a=>a.id==='label-0'),later:messages.slice(1).some(m=>m.find(a=>a.id==='label-0').cached),status:mapLayout.status};
 });expect(result.status).toBe('ready');expect(result.first.cached).toBe(false);expect(result.later).toBe(true);
});
