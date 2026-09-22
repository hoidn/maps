import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {fixtureHTML} from '../support/browser-fixture.js';
import {collectProfileEvidence} from '../../scripts/audit-cartography.mjs';

let runtime;
test.beforeAll(async()=>{
 runtime=(await build({stdin:{contents:"import {LayoutController} from './pipeline/labels/runtime.js';import policy from './pipeline/labels/policy.json';window.mapLayout=new LayoutController(document.getElementById('mapsvg'),JSON.parse(document.getElementById('map-label-manifest').textContent),policy);",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',loader:{'.txt':'text'}})).outputFiles[0].text;
});
async function mount(page,backend,{landcover=false}={}){
 let html=(await fixtureHTML()).replace('id="mapsvg"',`id="mapsvg" data-renderer="${backend}"`);
 html=html.replace('</style>','.no-water .hydro{display:none}</style>').replace('<defs>','<g class="hydro"><path class="water-line" data-source-id="3dhp:west-fork" d="M20,350 L480,350" fill="none" stroke="blue" stroke-width="4"/></g><defs>');
 await page.setContent(html);
 await page.evaluate(landcover=>{
  const source=document.getElementById('map-label-manifest'),m=JSON.parse(source.textContent);
  m.features.push({id:'summit',sourceId:'osm:peak',anchor:[50,50]});m.annotations.push({id:'summit-symbol',elementId:'summit-symbol',featureId:'summit',sourceId:'osm:peak',kind:'symbol',layer:'peaks',anchor:[50,50],priority:450,requiredProfiles:[]});source.textContent=JSON.stringify(m);
  document.querySelector('.labels').insertAdjacentHTML('beforeend','<g id="summit-symbol" data-layout-id="summit-symbol" data-feature-id="summit"><circle cx="50" cy="50" r="4" fill="black"/></g>');
  if(landcover){const c=document.createElement('canvas');c.width=c.height=1;c.getContext('2d').fillRect(0,0,1,1);document.getElementById('mapsvg').insertAdjacentHTML('afterbegin',`<image class="landcover" data-source-id="nlcd:fixture" width="500" height="400" href="${c.toDataURL()}"/>`);}
 },landcover);
 await page.addScriptTag({content:runtime});await page.evaluate(()=>mapLayout.whenSettled());
}

test('Canvas coverage follows submitted geometry rather than eligible scene inventory',async({page})=>{
 await mount(page,'canvas');
 expect((await page.evaluate(collectProfileEvidence)).geometrySourceIds.waterway).toEqual(['3dhp:west-fork']);
 const removed=await page.evaluate(()=>{
  const r=mapLayout.renderer;window.riverItems=r.scene.byLayer.get('hydro');
  const before=r.fg.getImageData(100,350,1,1).data[3];r.scene.byLayer.set('hydro',[]);r.draw(r.last.result,r.last.m,{foregroundOnly:true});
  return {before,after:r.fg.getImageData(100,350,1,1).data[3],retained:r.scene.items.some(i=>i.element.dataset.sourceId==='3dhp:west-fork')};
 });
 expect(removed).toEqual({before:255,after:0,retained:true});
 expect((await page.evaluate(collectProfileEvidence)).geometrySourceIds.waterway??[]).toEqual([]);
 await page.evaluate(()=>{const r=mapLayout.renderer;r.scene.byLayer.set('hydro',riverItems);r.draw(r.last.result,r.last.m,{foregroundOnly:true});});
 expect((await page.evaluate(collectProfileEvidence)).geometrySourceIds.waterway).toEqual(['3dhp:west-fork']);
 await page.evaluate(async()=>{mapLayout.setLayer('water',false);await mapLayout.whenSettled();});
 expect((await page.evaluate(collectProfileEvidence)).geometrySourceIds.waterway??[]).toEqual([]);
 expect(await page.evaluate(()=>{const r=mapLayout.renderer;r.destroy();return r.paintedGeometry.length;})).toBe(0);
});

test('landcover evidence survives foreground redraws and clears with its painted layer',async({page})=>{
 await mount(page,'canvas',{landcover:true});
 const alpha=()=>page.evaluate(()=>mapLayout.renderer.bg.getImageData(100,300,1,1).data[3]);
 expect(await alpha()).toBe(255);
 expect((await page.evaluate(collectProfileEvidence)).geometrySourceIds.landcover).toEqual(['nlcd:fixture']);
 await page.evaluate(()=>{const r=mapLayout.renderer;r.draw(r.last.result,r.last.m,{foregroundOnly:true});});
 expect(await alpha()).toBe(255);
 expect((await page.evaluate(collectProfileEvidence)).geometrySourceIds.landcover).toEqual(['nlcd:fixture']);
 await page.evaluate(async()=>{mapLayout.setLayer('landcover',false);await mapLayout.whenSettled();});
 expect(await alpha()).toBe(0);
 expect((await page.evaluate(collectProfileEvidence)).geometrySourceIds.landcover??[]).toEqual([]);
});

test('native SVG coverage reads visible source geometry without a Canvas renderer',async({page})=>{
 await mount(page,'svg');
 expect((await page.evaluate(collectProfileEvidence)).geometrySourceIds.poi).toEqual(['osm:peak']);
 await page.evaluate(()=>document.querySelector('#summit-symbol circle').style.opacity='0');
 expect((await page.evaluate(collectProfileEvidence)).geometrySourceIds.poi).toEqual([]);
 expect((await page.evaluate(collectProfileEvidence)).geometrySourceIds.waterway).toEqual(['3dhp:west-fork']);
 await page.evaluate(()=>document.querySelector('.water-line').style.opacity='0');
 expect((await page.evaluate(collectProfileEvidence)).geometrySourceIds.waterway??[]).toEqual([]);
 await page.evaluate(()=>document.querySelector('.water-line').style.opacity='1');
 expect((await page.evaluate(collectProfileEvidence)).geometrySourceIds.waterway).toEqual(['3dhp:west-fork']);
 await page.evaluate(async()=>{mapLayout.setLayer('water',false);await mapLayout.whenSettled();});
 expect((await page.evaluate(collectProfileEvidence)).geometrySourceIds.waterway??[]).toEqual([]);
});
