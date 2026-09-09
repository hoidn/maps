import {test,expect} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import fs from 'node:fs/promises';

test('a scroll between preparation slices aborts before writing mixed-frame metrics',async({page})=>{
 await page.setViewportSize({width:800,height:600});
 await page.setContent((await fixtureHTML()).replace('<div class="map-wrap">','<div style="height:300px"></div><div class="map-wrap">')+'<div style="height:1500px"></div>');
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();});
 const result=await page.evaluate(async()=>{
  const l=mapLayout;window.scrollTo(0,0);l.invalidateLayout();l.cache.invalidate();l.lineCache.clear();
  const nativeNow=performance.now.bind(performance),nativeSet=l.cache.entries.set.bind(l.cache.entries);
  let clockOffset=0,writes=0;const mixed=[];
  // Deterministically exhaust a preparation slice after each cache write. The
  // queued scroll executes while the worker is yielding, like wheel scrolling
  // or screenshot scrollIntoView during a large map's asynchronous preparation.
  performance.now=()=>nativeNow()+clockOffset;
  l.cache.entries.set=(id,value)=>{
   const a=l.byId.get(id),anchor=new DOMPoint(...a.anchor).matrixTransform(l.svg.getScreenCTM());
   if(Math.hypot(value.anchor[0]-anchor.x,value.anchor[1]-anchor.y)>1)mixed.push(id);
   const answer=nativeSet(id,value);clockOffset+=100;
   if(++writes===1)setTimeout(()=>window.scrollTo(0,200),0);
   else if(writes===2)setTimeout(()=>window.scrollTo(0,0),0);
   return answer;
  };
  let committed,remaining;
  try{committed=await l.render(true);remaining=l.cache.entries.size;}
  finally{performance.now=nativeNow;l.cache.entries.set=nativeSet;window.scrollTo(0,0);}
  const recovered=await l.render(true);
  return {committed,remaining,mixed,recovered,status:l.status,rendering:l.rendering,measurementNodes:l.svg.querySelectorAll('[data-layout-measurement]').length};
 });
 expect(result).toEqual({committed:false,remaining:0,mixed:[],recovered:true,status:'ready',rendering:false,measurementNodes:0});
});

for(const backend of ['svg','canvas','webgl'])test(`${backend} font recovery retries a placement cancelled by page scrolling`,async({page})=>{
 await page.setViewportSize({width:800,height:600});
 const html=(await fixtureHTML()).replace('id="mapsvg"',`id="mapsvg" data-renderer="${backend}"`).replace('<div class="map-wrap">','<div style="height:300px"></div><div class="map-wrap">')+'<div style="height:1500px"></div>';
 await page.setContent(html);
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(()=>mapLayout.whenSettled());
 const result=await page.evaluate(async()=>{
  const l=mapLayout,nativeNow=performance.now.bind(performance),nativeSet=l.cache.entries.set.bind(l.cache.entries),render=l.render;
  let clockOffset=0,writes=0;const attempts=[];
  performance.now=()=>nativeNow()+clockOffset;
  l.cache.entries.set=(id,value)=>{
   const answer=nativeSet(id,value);clockOffset+=100;
   if(++writes===1)setTimeout(()=>scrollTo(0,200),0);
   return answer;
  };
  l.render=async function(settled){const committed=await render.call(this,settled);if(settled)attempts.push(committed);return committed;};
  try{
   // Use the normal recovery entry point: its first real placement must abort
   // when the page moves between measurement slices, then retry without input.
   l.fontsChanged();await l.fontReady;await l.whenSettled();
   return {attempts,status:l.status,painted:l.renderer?.painted.length??l.visibleIds.size,viewportY:l.lastViewport.y,actualY:l.svg.getBoundingClientRect().y};
  }finally{performance.now=nativeNow;l.cache.entries.set=nativeSet;l.render=render;}
 });
 expect(result.attempts[0]).toBe(false);
 expect(result.attempts).toContain(true);
 expect(result.status).toBe('ready');
 expect(result.painted).toBeGreaterThan(0);
 expect(result.viewportY).toBe(result.actualY);
});
