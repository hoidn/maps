import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {fixtureHTML} from '../support/browser-fixture.js';

test('initial label budget paints eight distinct important names without measuring the entire inventory',async({page})=>{
 await page.setContent((await fixtureHTML()).replace('id="mapsvg"','id="mapsvg" data-renderer="canvas"'));
 await page.evaluate(()=>{
  const script=document.getElementById('map-label-manifest'),manifest=JSON.parse(script.textContent),group=document.querySelector('.labels');
  const anchors=[[35,45],[150,45],[265,45],[35,145],[150,145],[265,145],[35,335],[265,335]];
  for(let i=0;i<38;i++){
   const primary=i<8,id='batch-'+i,anchor=primary?anchors[i]:[45+(i%4)*110,55+Math.floor(i/4)*25],name=primary?'Primary '+i:'Secondary '+i;
   manifest.features.push({id:'feature-'+id,name,anchor,directory:false});
   manifest.annotations.push({id,elementId:id,featureId:'feature-'+id,kind:'point-label',layer:'places',anchor,text:name,style:'l-place',priority:primary?990-i:500,requiredProfiles:[]});
   group.insertAdjacentHTML('beforeend',`<g id="${id}" data-layout-id="${id}" data-feature-id="feature-${id}"><text class="l-place" style="transform:translate(${anchor[0]}px,${anchor[1]}px) scale(var(--k)) translate(7px,4px)">${name}</text></g>`);
  }
  script.textContent=JSON.stringify(manifest);
  const now=performance.now.bind(performance),query=Element.prototype.querySelector;let offset=0;
  window.measuredInitial=[];
  performance.now=()=>now()+offset;
  Element.prototype.querySelector=function(selector){
   if(selector==='text'&&this.hasAttribute('data-layout-measurement')&&window.mapLayout?.starting){offset+=30;measuredInitial.push(this.dataset.featureId);}
   return query.call(this,selector);
  };
  const send=Worker.prototype.postMessage;window.initialPayload=null;window.releaseInitial=null;
  Worker.prototype.postMessage=function(message,...rest){
   if(message.kind==='solve-initial'&&!initialPayload){initialPayload=message;releaseInitial=()=>{Element.prototype.querySelector=query;performance.now=now;send.call(this,message,...rest);};return;}
   return send.call(this,message,...rest);
  };
 });
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.waitForFunction(()=>initialPayload);
 const seed=await page.evaluate(()=>({annotations:initialPayload.payload?.annotations??initialPayload.annotations,measured:measuredInitial}));
 expect(seed.measured.some(id=>Number(id?.split('-').at(-1))>=8)).toBe(false);
 const annotations=seed.annotations;
 for(let i=0;i<8;i++)expect(annotations.find(a=>a.id==='batch-'+i).candidates.length).toBeGreaterThan(0);
 expect(annotations.filter(a=>a.id.startsWith('batch-')&&Number(a.id.slice(6))>=8).every(a=>a.eligibleReason==='budget-deferred')).toBe(true);
 const first=await page.evaluate(async()=>{releaseInitial();await mapLayout.ready;return {names:[...mapLayout.visibleIds].filter(id=>/^batch-[0-7]$/.test(id)),painted:mapLayout.renderer.painted.map(p=>p.id),batch:mapLayout.initialLabelBatch,useful:mapLayout.firstUsefulLabels};});
 expect(first.names).toHaveLength(8);expect(first.batch.paintedNames).toBeGreaterThanOrEqual(8);expect(first.batch.useful).toBe(true);expect(first.useful.paintedAt).toBe(first.batch.paintedAt);for(const id of first.names)expect(first.painted).toContain(id);
 await page.evaluate(()=>mapLayout.whenSettled());
 expect(await page.evaluate(()=>mapLayout.prepared.filter(a=>a.id.startsWith('batch-')).every(a=>a.eligibleReason!=='budget-deferred'))).toBe(true);
 expect(await page.evaluate(()=>mapLayout.svg.querySelectorAll('[data-layout-measurement]').length)).toBe(0);
});
