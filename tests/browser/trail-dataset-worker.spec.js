import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
let bundle;
test.beforeAll(async()=>{
 const worker=(await build({entryPoints:['pipeline/labels/initial-placement-worker.js'],bundle:true,format:'iife',write:false})).outputFiles[0].text;
 bundle=(await build({entryPoints:['pipeline/labels/initial-placement-client.js'],bundle:true,format:'iife',globalName:'datasetClient',write:false,plugins:[{name:'current-worker',setup(b){b.onLoad({filter:/initial-worker\.txt$/},()=>({contents:worker,loader:'text'}));}}]})).outputFiles[0].text;
});
async function setup(page){
 await page.setContent('<body></body>');await page.addScriptTag({content:bundle});
 await page.evaluate(()=>{
  const segments=[{id:'protected',a:[0,20],b:[100,20],width:2,bounds:{x:0,y:20,width:100,height:0}}],shape={bounds:{x:40,y:19,width:20,height:4},parts:[{x:40,y:19,width:20,height:4}]};
  window.datasetArgs={annotations:[{id:'text',candidates:[{id:'center',shape}]}],viewport:{width:200,height:200},policy:{repairMaxNeighbors:0},trail:{segments,matrix:{a:1,b:0,c:0,d:1,e:0,f:0},inverse:{a:1,b:0,c:0,d:1,e:0,f:0},strokeScale:1,scale:1,maxWidth:2,metersPerPixel:1}};
  window.messages=[];const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(data,...rest){messages.push({segments:Object.hasOwn(data.payload.trail,'segments'),version:data.payload.trail.datasetVersion});return send.call(this,data,...rest);};
 });
}
test('real worker reuses geometry while camera changes retain protected-trail checks',async({page})=>{
 await setup(page);const result=await page.evaluate(async()=>{
  const client=new datasetClient.InitialPlacementClient(),first=await client.solve(datasetArgs);
  const moved={...datasetArgs,trail:{...datasetArgs.trail,matrix:{...datasetArgs.trail.matrix,f:80},inverse:{...datasetArgs.trail.inverse,f:-80}}},second=await client.solve(moved),third=await client.solve({...datasetArgs,trail:{...datasetArgs.trail,segments:[...datasetArgs.trail.segments]}});
  client.close();return {counts:[first,second,third].map(r=>r.placements.length),messages};
 });expect(result.counts).toEqual([0,1,0]);expect(result.messages.map(m=>m.segments)).toEqual([true,false,true]);expect(result.messages.map(m=>m.version)).toEqual([1,1,2]);
});
test('cancelling a pending solve restarts the worker with the full immutable dataset',async({page})=>{
 await setup(page);const result=await page.evaluate(async()=>{
  const client=new datasetClient.InitialPlacementClient();await client.solve(datasetArgs);
  const pending=client.solve(datasetArgs).then(()=>null,e=>e.name);client.cancel();const cancelled=await pending;
  const after=await client.solve(datasetArgs);client.close();return {cancelled,count:after.placements.length,messages};
 });expect(result.cancelled).toBe('AbortError');expect(result.count).toBe(0);expect(result.messages.map(m=>m.segments)).toEqual([true,false,true]);
});
test('blocked workers keep complete geometry in cooperative fallback payloads',async({page})=>{
 await setup(page);const result=await page.evaluate(async()=>{
  window.Worker=class{constructor(){throw new Error('Worker blocked');}};
  const client=new datasetClient.InitialPlacementClient(),a=await client.solve(datasetArgs),b=await client.solve(datasetArgs);client.close();return {counts:[a.placements.length,b.placements.length],blocked:client.blocked,messages};
 });expect(result.counts).toEqual([0,0]);expect(result.blocked).toBe(true);expect(result.messages).toEqual([]);
});
