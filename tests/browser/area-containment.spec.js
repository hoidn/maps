import {test,expect} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import {build} from 'esbuild';
let bundle;
test.beforeAll(async()=>{
 const worker=(await build({entryPoints:['pipeline/labels/initial-placement-worker.js'],bundle:true,format:'iife',write:false})).outputFiles[0].text;
 bundle=(await build({entryPoints:['pipeline/labels/browser.js'],bundle:true,format:'iife',write:false,plugins:[{name:'fixture-worker',setup(b){b.onLoad({filter:/initial-worker\.txt$/},()=>({contents:worker,loader:'text'}));}}]})).outputFiles[0].text;
});
for(const backend of ['svg','canvas'])test(`${backend} projects area containment in settled and fast pan/zoom frames`,async({page})=>{
 let html=await fixtureHTML();if(backend==='canvas')html=html.replace('class="map" data-w','class="map" data-renderer="canvas" data-w');
 await page.setContent(html);
 await page.evaluate(()=>{const e=document.getElementById('map-label-manifest'),m=JSON.parse(e.textContent);m.annotations.find(a=>a.id==='label-0').areaPolygons=[[[[50,50],[180,50],[180,150],[50,150],[50,50]]]];e.textContent=JSON.stringify(m)});
 await page.addScriptTag({content:bundle});
 const r=await page.evaluate(async()=>{
  const l=mapLayout;await l.whenSettled();const reports=[];
  for(const view of [{x:0,y:0,w:500,h:400},{x:10,y:10,w:250,h:200},{x:11,y:12,w:250,h:200}]){
   l.requestView(view);await l.whenSettled();const {m,z}=l.camera(),a=l.prepared.find(a=>a.id==='label-0'),fast=l.fastPrepared(m,l.lastViewport,z).find(a=>a.id==='label-0'),world=l.manifest.annotations.find(a=>a.id==='label-0').areaPolygons[0][0][0];
   const point=fast.areaPolygons[0][0][0],fm=fast.areaTransform;
   reports.push({placed:l.result.placements.some(p=>p.id==='label-0'),settled:a.areaPolygons[0][0][0],fast:fm?[fm.a*point[0]+fm.c*point[1]+fm.e,fm.b*point[0]+fm.d*point[1]+fm.f]:point,worldRetained:!fm||fast.areaPolygons===l.manifest.annotations.find(a=>a.id==='label-0').areaPolygons,expected:[m.a*world[0]+m.c*world[1]+m.e,m.b*world[0]+m.d*world[1]+m.f]});
  }return reports;
 });
 for(const r0 of r){expect(r0.placed).toBe(true);expect(r0.worldRetained).toBe(true);expect(r0.settled).toEqual(r0.expected);expect(r0.fast).toEqual(r0.expected)}
});
