import {test,expect} from '@playwright/test';
import {mountFixture} from '../support/browser-fixture.js';

test('held gestures never settle during gaps between input events',async({page})=>{
 await mountFixture(page);await page.evaluate(()=>mapLayout.whenSettled());
 const result=await page.evaluate(async()=>{
  const l=mapLayout,start=l.samples.length;l.beginGesture('pointer');
  for(let i=0;i<4;i++){l.requestView({...l.view,x:l.view.x+1});await new Promise(r=>setTimeout(r,90));}
  const during=l.samples.slice(start).filter(s=>s.kind==='settled').length;
  l.endGesture('pointer');await l.whenSettled();return {during,after:l.transactionKind};
 });
 expect(result.during).toBe(0);expect(result.after).toBe('settled');
});

test('ordinary panning reuses label metrics and restores clipped placements',async({page})=>{
 await mountFixture(page);await page.evaluate(()=>{mapLayout.requestView({x:0,y:0,w:400,h:320});return mapLayout.whenSettled();});
 const result=await page.evaluate(async()=>{
  const l=mapLayout,ids=[...l.visibleIds],before=ids.map(id=>l.elements.get(id).getAttribute('transform'));let measurements=0;
  for(const id of ids){for(const e of [l.elements.get(id),...l.elements.get(id).querySelectorAll('*')])for(const key of ['getBBox','getExtentOfChar'])if(e[key]){const original=e[key].bind(e);e[key]=(...a)=>{measurements++;return original(...a);};}}
  l.beginGesture('pointer');for(let i=0;i<10;i++){l.requestView({...l.view,x:i*.2});await new Promise(requestAnimationFrame);}
  const during=measurements;l.endGesture('pointer');await l.whenSettled();return {during,before,after:ids.map(id=>l.elements.get(id).getAttribute('transform'))};
 });
 expect(result.during).toBe(0);expect(result.after).toEqual(result.before);
});

test('new input discards an unfinished worker placement without blocking fast frames',async({page})=>{
 await mountFixture(page);await page.evaluate(()=>mapLayout.whenSettled());
 const result=await page.evaluate(async()=>{
  const l=mapLayout;if(!l.initialPlacer.worker)throw new Error("Settled placement worker unavailable");let release,started;
  const pending=new Promise(r=>started=r),original=l.initialPlacer.solve.bind(l.initialPlacer);
  l.initialPlacer.solve=async payload=>{started();await new Promise(r=>release=r);return original(payload);};
  l.requestView({x:5,y:0,w:300,h:240});await pending;
  l.beginGesture('pointer');l.requestView({x:25,y:0,w:280,h:224});await new Promise(requestAnimationFrame);
  const moving={kind:l.transactionKind,view:{...l.view}};release();await new Promise(r=>setTimeout(r,100));
  const staleCommitted=l.samples.at(-1)?.kind==='settled';l.initialPlacer.solve=original;
  l.endGesture('pointer');await l.whenSettled();return {moving,staleCommitted,final:l.getReport().view};
 });
 expect(result.moving.kind).toBe('fast');expect(result.staleCommitted).toBe(false);expect(result.final).toEqual(result.moving.view);
});
