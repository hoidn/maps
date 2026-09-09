import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {fixtureHTML} from '../support/browser-fixture.js';
test('warm control measurement avoids scanning SVG artwork and still discovers new HTML controls',async({page})=>{
 await page.setContent((await fixtureHTML()).replace('id="mapsvg"','id="mapsvg" data-renderer="canvas"'));
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(()=>mapLayout.whenSettled());
 const result=await page.evaluate(()=>{
  const l=mapLayout,before=l.controls(),svgQuery=l.svg.querySelectorAll,parentQuery=l.svg.parentElement.querySelectorAll;
  const control=document.createElement('div');control.className='readout';control.style.cssText='position:absolute;left:180px;top:180px;width:40px;height:20px';l.svg.parentElement.append(control);
  l.svg.querySelectorAll=()=>{throw Error('Rescanned immutable artwork');};
  l.svg.parentElement.querySelectorAll=()=>{throw Error('Scanned artwork through map container');};
  try{const after=l.controls();control.style.left='200px';const moved=l.controls();return {before:before.length,after:after.length,added:after.at(-1).shape.bounds,moved:moved.at(-1).shape.bounds};}
  finally{l.svg.querySelectorAll=svgQuery;l.svg.parentElement.querySelectorAll=parentQuery;control.remove();}
 });
 expect(result.after).toBe(result.before+1);expect(result.added).toMatchObject({x:180,y:180,width:40,height:20});expect(result.moved.x).toBe(200);
});

test('fast eligibility reads one viewport scale while preserving current geometry decisions',async({page})=>{
 await page.setContent((await fixtureHTML()).replace('id="mapsvg"','id="mapsvg" data-renderer="canvas"'));
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(()=>mapLayout.whenSettled());
 const result=await page.evaluate(()=>{
  const l=mapLayout,r=l.renderer,m=r.camera(l.view).m,viewport=l.svg.getBoundingClientRect(),get=Object.getOwnPropertyDescriptor(Element.prototype,'clientWidth').get;let reads=0;
  for(const a of l.manifest.annotations)a.geometryBounds=[0,0,500,400];
  Object.defineProperty(l.svg,'clientWidth',{configurable:true,get(){reads++;return get.call(this);}});
  let prepared;try{prepared=r.prepareFast(m,viewport,1);}finally{delete l.svg.clientWidth;}
  return {reads,actual:prepared.map(a=>a.eligibleReason??null),expected:l.manifest.annotations.map(a=>l.eligible(a,[m.a*a.anchor[0]+m.e,m.d*a.anchor[1]+m.f],viewport,1)??(r.labels.has(a.id)?null:'budget-deferred'))};
 });
 expect(result.reads).toBe(1);expect(result.actual).toEqual(result.expected);
});

test('reused fast items refresh candidates and preserve earlier solver results',async({page})=>{
 await page.setContent((await fixtureHTML()).replace('id="mapsvg"','id="mapsvg" data-renderer="canvas"'));
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(()=>mapLayout.whenSettled());
 const result=await page.evaluate(async()=>{
  await mapLayout.render(false);
  const l=mapLayout,r=l.renderer,m=r.camera(l.view).m,viewport=l.svg.getBoundingClientRect(),before=JSON.stringify(l.result),saved=new Map(r.labels);
  const first=r.prepareFast(m,viewport,1),placed=first.find(a=>a.candidates.length),id=placed.id,shape=structuredClone(placed.candidates[0].shape);
  r.labels.clear();const deferred=r.prepareFast(m,viewport,1).find(a=>a.id===id);
  const empty=deferred.candidates.length===0&&deferred.eligibleReason==='budget-deferred';r.labels=saved;
  const shifted=new DOMMatrix([m.a,m.b,m.c,m.d,m.e+5,m.f+7]);
  const fresh=r.prepareFast(shifted,viewport,1).find(a=>a.id===id);
  return {empty,before,after:JSON.stringify(l.result),oldBounds:shape.bounds,bounds:fresh.candidates[0].shape.bounds,reason:fresh.eligibleReason??null};
 });
 expect(result.empty).toBe(true);expect(result.after).toBe(result.before);expect(result.reason).toBe(null);
 expect(result.bounds.x).toBeCloseTo(result.oldBounds.x+5);expect(result.bounds.y).toBeCloseTo(result.oldBounds.y+7);
});

test('fast drawing resolves every sprite once and preserves layer order and camera projection',async({page})=>{
 await page.setContent((await fixtureHTML()).replace('id="mapsvg"','id="mapsvg" data-renderer="canvas"'));
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(()=>mapLayout.whenSettled());
 const result=await page.evaluate(()=>{
  const l=mapLayout,r=l.renderer,before=r.painted.map(p=>p.id),get=r.labels.get.bind(r.labels);let reads=0;
  r.labels.get=id=>{reads++;return get(id);};
  try{r.draw(l.result,r.last.m);}finally{delete r.labels.get;}
  return {reads,count:l.result.placements.length,before,after:r.painted.map(p=>p.id),projected:r.painted.map(p=>{
   const record=get(p.id),m=r.last.m,c=new DOMPoint(...record.worldCenter).matrixTransform(m);
   return {actual:p.offset,expected:[c.x-record.center[0],c.y-record.center[1]]};
  })};
 });
 expect(result.count).toBeGreaterThan(0);expect(result.reads).toBe(result.count);expect(result.after).toEqual(result.before);
 for(const p of result.projected){expect(p.actual[0]).toBeCloseTo(p.expected[0],5);expect(p.actual[1]).toBeCloseTo(p.expected[1],5);}
});
