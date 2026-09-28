import {test,expect} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import fs from 'node:fs/promises';

const attributes={class:'area-building','data-max-mpp':'8','fill-rule':'evenodd',style:'fill:var(--building-fill);stroke:var(--building-edge);stroke-width:calc(.15px * var(--s))'};
const paths=[
 ['M20,20H35V35H20Z M24,24H31V31H24Z M45,20H60V35H45Z','b-disjoint',[20,20,60,35]],
 ['M70,20H80V30H70Z M85,20H95V30H85Z','b-multipolygon',[70,20,95,30]],
 ['M-10,45H-0.04V55H-10Z','b-edge',[-10,45,-0.04,55]],
];
const panPaths=[
 ['M20,20H30V30H20Z','a',[20,20,30,30]],
 ['M120,20H130V30H120Z','b',[120,20,130,30]],
 ['M235,20H245V30H235Z','c',[235,20,245,30]],
];

async function mount(page,backend='canvas',payload={version:1,attributes,paths},afterRuntime=null){
 let html=await fixtureHTML();
 html=html.replace('<style>', '<style>:root{--building-fill:rgb(220,20,60);--building-edge:rgb(0,0,0)}:root[data-theme="dark"]{--building-fill:rgb(20,80,220)}')
  .replace('id="mapsvg"',`id="mapsvg" data-renderer="${backend}"`)
  .replace('viewBox="0 0 500 400"','viewBox="0 0 100 80"')
  .replace('<g class="labels">','<g class="buildings" data-building-payload="map-building-payload"></g><g class="labels">');
 const manifest=JSON.parse(html.match(/<script[^>]+id="map-label-manifest"[^>]*>(.*?)<\/script>/s)[1]);
 manifest.map.width=100;manifest.map.height=80;manifest.map.metersPerMapUnit=1;
 html=html.replace(/(<script[^>]+id="map-label-manifest"[^>]*>).*?(<\/script>)/s,`$1${JSON.stringify(manifest)}$2`)
  +(payload===null?'':`<script type="application/json" id="map-building-payload">${JSON.stringify(payload)}</script>`);
 await page.setContent(html);
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')+(afterRuntime?`\n;(${afterRuntime})();`:'')});
 if(!afterRuntime)await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();});
}

async function rasterPixels(page,points){
 const bytes=Array.from(await page.locator('.map-wrap').screenshot());
 return page.evaluate(async({bytes,points})=>{
  const image=new Image();image.src=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'image/png'}));await image.decode();
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
  return points.map(([x,y])=>[...ctx.getImageData(x,y,1,1).data]);
 },{bytes,points});
}

for(const backend of ['svg','canvas','webgl'])test(`${backend} materializes source-ordered payload geometry in the settled paint`,async({page})=>{
 await mount(page,backend);
 const result=await page.evaluate(()=>{
  const renderer=mapLayout.renderer,group=document.querySelector('.buildings');
  return {status:mapLayout.status,renderer:renderer?.backend||'svg',requested:document.getElementById('mapsvg').dataset.renderer,fallback:renderer?.fallbackReason||mapLayout.rendererError||null,
   paths:[...group.children].map(e=>({id:e.dataset.sourceId,d:e.getAttribute('d'),class:e.getAttribute('class'),max:e.getAttribute('data-max-mpp'),rule:e.getAttribute('fill-rule'),style:e.getAttribute('style')})),
   payloadRemoved:!document.getElementById('map-building-payload')};
 });
 expect(result.status).toBe('ready');
 expect(result.paths).toEqual(paths.map(([d,id])=>({id,d,class:attributes.class,max:attributes['data-max-mpp'],rule:attributes['fill-rule'],style:attributes.style})));
 expect(result.payloadRemoved).toBe(true);
 test.info().annotations.push({type:'renderer',description:`requested ${backend}; actual ${result.renderer}; fallback ${result.fallback||'none'}`});
 expect(backend==='webgl'?['canvas','webgl']:[backend]).toContain(result.renderer);expect(result.requested).toBe(backend);
 if(backend!==result.renderer)expect(result.fallback).toBeTruthy();
 const [ring,hole,separate,multiA,multiB,edge]=await rasterPixels(page,[[112,112],[135,135],[250,135],[365,125],[450,125],[0,250]]);
 expect(ring[0]).toBeGreaterThan(180);expect(ring[1]).toBeLessThan(60);expect(hole[0]).toBeGreaterThan(245);
 expect(separate[0]).toBeGreaterThan(180);expect(multiA[0]).toBeGreaterThan(180);expect(multiB[0]).toBeGreaterThan(180);
 expect(edge[0]).toBeLessThan(240);
});

test('Canvas keeps the last complete building frame through superseded A→B→C preparation',async({page})=>{
 await mount(page,'canvas',{version:1,attributes,paths:panPaths});
 await page.evaluate(async()=>{mapLayout.setLayer('contours',false);await mapLayout.whenSettled();});
 const initial=await page.evaluate(()=>({view:mapLayout.renderer.paintedView,camera:mapLayout.renderer.last.m.e,ids:[...document.querySelectorAll('.buildings>.area-building')].map(e=>e.dataset.sourceId)}));
 expect(initial).toEqual({view:{x:0,y:0,w:100,h:80},camera:0,ids:['a']});
 await page.evaluate(()=>{
  const helper=mapLayout.buildings,original=helper.build.bind(helper);window.heldBuildingBuilds=[];
  helper.build=token=>new Promise(resolve=>window.heldBuildingBuilds.push({x:token.view.x,release:()=>resolve(original(token))}));
  mapLayout.requestView({x:100,y:0,w:100,h:80});
 });
 await page.waitForFunction(()=>heldBuildingBuilds.some(build=>build.x===100));
 await page.evaluate(()=>mapLayout.requestView({x:200,y:0,w:100,h:80}));
 await page.waitForFunction(()=>heldBuildingBuilds.some(build=>build.x===200));
 const pending=await page.evaluate(()=>{
  window.currentIdle=false;mapLayout.whenSettled().then(()=>{window.currentIdle=true;});
  return {camera:mapLayout.renderer.last.m.e,painted:mapLayout.renderer.paintedView,ids:[...document.querySelectorAll('.buildings>.area-building')].map(e=>e.dataset.sourceId),idle:currentIdle,backend:mapLayout.renderer.backend};
 });
 expect(pending).toEqual({camera:initial.camera,painted:initial.view,ids:['a'],idle:false,backend:'canvas'});
 await page.waitForFunction(()=>mapLayout.buildings.pending?.view.x===200);
 expect(await page.evaluate(()=>({camera:mapLayout.renderer.last.m.e,painted:mapLayout.renderer.paintedView,ids:[...document.querySelectorAll('.buildings>.area-building')].map(e=>e.dataset.sourceId),idle:currentIdle}))).toEqual({camera:initial.camera,painted:initial.view,ids:['a'],idle:false});
 await page.evaluate(()=>heldBuildingBuilds.find(build=>build.x===200).release());
 await page.evaluate(()=>mapLayout.whenSettled());
 await page.evaluate(()=>heldBuildingBuilds.find(build=>build.x===100).release());
 await page.waitForTimeout(20);
 const final=await page.evaluate(()=>({camera:mapLayout.renderer.last.m.e,view:mapLayout.view,painted:mapLayout.renderer.paintedView,ids:[...document.querySelectorAll('.buildings>.area-building')].map(e=>e.dataset.sourceId),idle:currentIdle,backend:mapLayout.renderer.backend,fallback:mapLayout.renderer.fallbackReason,stages:document.querySelectorAll('.buildings>[data-layout-runtime]').length}));
 expect(final).toEqual({camera:-1000,view:{x:200,y:0,w:100,h:80},painted:{x:200,y:0,w:100,h:80},ids:['c'],idle:true,backend:'canvas',fallback:undefined,stages:0});
});

test('a cancelled building slice cannot discard a newer staged set',async({page})=>{
 await mount(page,'canvas',{version:1,attributes,paths:panPaths});
 await page.evaluate(()=>{
  const helper=mapLayout.buildings,build=helper.build.bind(helper);window.buildingSlices=[];
  helper.build=token=>{
   const now=performance.now,timer=window.setTimeout;let ticks=0;
   performance.now=()=>ticks+=10;
   window.setTimeout=(callback,delay,...args)=>{if(delay===0){buildingSlices.push({token,release:callback});return 0;}return timer(callback,delay,...args);};
   try{return build(token).finally(()=>{token.probeFinished=true;});}finally{performance.now=now;window.setTimeout=timer;}
  };
  mapLayout.requestView({x:100,y:0,w:100,h:80});
 });
 await page.waitForFunction(()=>buildingSlices.some(s=>s.token.view.x===100&&s.token.stage?.children.length));
 await page.evaluate(()=>mapLayout.requestView({x:200,y:0,w:100,h:80}));
 await page.waitForFunction(()=>buildingSlices.some(s=>s.token.view.x===200&&s.token.stage?.children.length));
 await page.evaluate(()=>buildingSlices.find(s=>s.token.view.x===100).release());
 await page.waitForFunction(()=>buildingSlices.find(s=>s.token.view.x===100).token.probeFinished);
 expect(await page.evaluate(()=>({indices:[...mapLayout.buildings.nodes.keys()],staged:mapLayout.buildings.pending.stage.children.length,painted:mapLayout.renderer.paintedView}))).toEqual({indices:[0,2],staged:1,painted:{x:0,y:0,w:100,h:80}});
 const [old]=await rasterPixels(page,[[112,112]]);expect(old[0]).toBeGreaterThan(180);expect(old[1]).toBeLessThan(60);
 await page.evaluate(()=>buildingSlices.find(s=>s.token.view.x===200).release());await page.evaluate(()=>mapLayout.whenSettled());
 const [cleared,current]=await rasterPixels(page,[[112,112],[187,125]]);expect(cleared[1]).toBeGreaterThan(245);expect(current[0]).toBeGreaterThan(180);expect(current[1]).toBeLessThan(60);
});

test('a marked group with a missing or invalid payload reports an explicit geometry error',async({page})=>{
 for(const payload of [null,{version:2,attributes,paths},{version:1,attributes,paths:{length:1}},
  {version:1,attributes:{...attributes,fill:'red'},paths},{version:1,attributes,paths:[['M0,0Z','bad',[0,0,null,1]]]}]){
  let html=await fixtureHTML();html=html.replace('<style>','<style>:root{--building-fill:red;--building-edge:black}').replace('<g class="labels">','<g class="buildings" data-building-payload="map-building-payload"></g><g class="labels">');
  html+=payload===null?'':`<script type="application/json" id="map-building-payload">${JSON.stringify(payload)}</script>`;
  await page.setContent(html);await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
  await page.evaluate(()=>mapLayout.ready.catch(()=>{}));
  const result=await page.evaluate(()=>({status:mapLayout.status,error:mapLayout.error,groupChildren:document.querySelector('.buildings').children.length,renderer:mapLayout.renderer?.backend||'svg'}));
  expect(result.status).toBe('error');expect(result.error).toMatch(/building geometry unavailable/i);expect(result.groupChildren).toBe(0);expect(result.renderer).toBe('svg');
 }
});

for(const backend of ['svg','canvas','webgl'])test(`${backend} bounds building nodes to the viewport, scale and current theme`,async({page})=>{
 await mount(page,backend,undefined,()=>{mapLayout.manifest.map.metersPerMapUnit=32;});
 await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();const node=mapLayout.buildings.nodes.get(0);window.firstBuilding=node.element;window.firstBuildingCapture=node.commands;});
 const retained=await page.evaluate(async()=>{
  mapLayout.requestView({x:15,y:15,w:35,h:28});await mapLayout.whenSettled();
  return {same:mapLayout.buildings.nodes.get(0).element===firstBuilding,sameCapture:mapLayout.buildings.nodes.get(0).commands===firstBuildingCapture,indices:[...mapLayout.buildings.nodes.keys()]};
 });
 expect(retained).toEqual({same:true,sameCapture:true,indices:[0]});
 const disjoint=await page.evaluate(async()=>{
  mapLayout.requestView({x:65,y:15,w:35,h:28});await mapLayout.whenSettled();
  return {oldConnected:firstBuilding.isConnected,indices:[...mapLayout.buildings.nodes.keys()],ids:[...document.querySelectorAll('.buildings>.area-building')].map(e=>e.dataset.sourceId)};
 });
 expect(disjoint).toEqual({oldConnected:false,indices:[1],ids:['b-multipolygon']});
 await page.evaluate(async()=>{mapLayout.requestView({x:0,y:0,w:100,h:80});await mapLayout.whenSettled();document.querySelector('.map-wrap').style.width='300px';});
 await expect.poll(()=>page.evaluate(()=>mapLayout.buildings.committed?.indices.length)).toBe(0);
 await page.evaluate(()=>mapLayout.whenSettled());
 expect(await page.locator('.buildings>.area-building').count()).toBe(0);
 await page.evaluate(async()=>{mapLayout.requestView({x:0,y:0,w:50,h:40});await mapLayout.whenSettled();});
 expect(await page.locator('.buildings>.area-building').count()).toBe(1);
 await page.evaluate(()=>{document.querySelector('.map-wrap').style.width='500px';mapLayout.requestView({x:0,y:0,w:100,h:80});});
 await expect.poll(()=>page.evaluate(()=>mapLayout.buildings.committed?.indices.length)).toBe(3);
 await page.evaluate(async()=>{await mapLayout.whenSettled();document.documentElement.dataset.theme='dark';});
 await page.evaluate(()=>mapLayout.whenSettled());
 const [dark]=await rasterPixels(page,[[112,112]]);expect(dark[2]).toBeGreaterThan(180);expect(dark[0]).toBeLessThan(60);
 await page.evaluate(()=>{document.documentElement.dataset.theme='light';});await page.evaluate(()=>mapLayout.whenSettled());
 const [light]=await rasterPixels(page,[[112,112]]);expect(light[0]).toBeGreaterThan(180);expect(light[2]).toBeLessThan(90);
});

test('native fallback waits for its buildings and final page hide cancels outstanding work',async({page})=>{
 await mount(page);
 await page.evaluate(()=>{
  const helper=mapLayout.buildings,build=helper.build.bind(helper);
  helper.build=token=>new Promise(resolve=>{window.releaseBuildingFallback=()=>resolve(build(token));});
  mapLayout.requestView({x:65,y:15,w:35,h:28});window.oldRenderer=mapLayout.renderer;oldRenderer.fallback(new Error('Fixture renderer failure'));
 });
 await page.waitForFunction(()=>!!window.releaseBuildingFallback);
 expect(await page.evaluate(()=>({active:oldRenderer.active,renderer:!!mapLayout.renderer,view:oldRenderer.paintedView,opacity:mapLayout.svg.style.opacity}))).toEqual({active:true,renderer:true,view:{x:0,y:0,w:100,h:80},opacity:'0'});
 await page.evaluate(()=>releaseBuildingFallback());
 await expect.poll(()=>page.evaluate(()=>!!mapLayout.renderer)).toBe(false);
 await page.evaluate(()=>mapLayout.whenSettled());
 expect(await page.evaluate(()=>({view:mapLayout.svg.getAttribute('viewBox'),ids:[...document.querySelectorAll('.buildings>.area-building')].map(e=>e.dataset.sourceId),opacity:mapLayout.svg.style.opacity}))).toEqual({view:'65 15 35 28',ids:['b-multipolygon'],opacity:''});
 await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.preservedBuildings=!mapLayout.buildings.closed;mapLayout.requestView({x:0,y:0,w:100,h:80});});
 await page.waitForFunction(()=>!!mapLayout.buildings.pending);
 const state=await page.evaluate(async()=>{
  dispatchEvent(new PageTransitionEvent('pagehide',{persisted:false}));releaseBuildingFallback();await new Promise(resolve=>setTimeout(resolve,0));
  return {preserved:preservedBuildings,closed:mapLayout.buildings.closed,pending:!!mapLayout.buildings.pending,stages:document.querySelectorAll('.buildings>[data-layout-runtime]').length};
 });
 expect(state).toEqual({preserved:true,closed:true,pending:false,stages:0});
});

for(const backend of ['svg','canvas'])test(`${backend} startup rejects old building views and still accepts later themes`,async({page})=>{
 await mount(page,backend,undefined,()=>{
  const helper=mapLayout.buildings,build=helper.build.bind(helper);window.startupBuilds=[];window.holdBuildings=true;window.startupReady=false;
  helper.build=token=>holdBuildings?new Promise(resolve=>startupBuilds.push({token,release:()=>resolve(build(token))})):build(token);
  mapLayout.ready.then(()=>{startupReady=true;});
 });
 await page.waitForFunction(()=>startupBuilds.length>0);
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';mapLayout.requestView({x:65,y:15,w:35,h:28});});
 await page.waitForFunction(()=>startupBuilds.some(b=>b.token.view.x===65&&!b.token.cancelled));
 expect(await page.evaluate(()=>({ready:startupReady,view:mapLayout.svg.getAttribute('viewBox'),painted:mapLayout.renderer?.paintedView??null,ids:[...document.querySelectorAll('.buildings>.area-building')].map(e=>e.dataset.sourceId)}))).toEqual({ready:false,view:'0 0 100 80',painted:null,ids:[]});
 await page.evaluate(()=>{holdBuildings=false;startupBuilds.find(b=>b.token===mapLayout.buildings.pending).release();});
 await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();for(const b of startupBuilds)if(b.token.cancelled)b.release();});
 expect(await page.evaluate(()=>({view:mapLayout.buildings.committed.view,backend:mapLayout.renderer?.backend||'svg',stages:document.querySelectorAll('.buildings>[data-layout-runtime]').length}))).toEqual({view:{x:65,y:15,w:35,h:28},backend,stages:0});
 const [dark]=await rasterPixels(page,[[100,100]]);expect(dark[2]).toBeGreaterThan(180);expect(dark[0]).toBeLessThan(60);
 await page.evaluate(()=>{document.documentElement.dataset.theme='light';});await page.evaluate(()=>mapLayout.whenSettled());
 const [light]=await rasterPixels(page,[[100,100]]);expect(light[0]).toBeGreaterThan(180);expect(light[2]).toBeLessThan(90);
});
