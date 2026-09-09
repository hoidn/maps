import {test,expect} from '@playwright/test';
import {fixtureHTML,mountFixture} from '../support/browser-fixture.js';
import fs from 'node:fs/promises';

async function mount(page){
 let html=await fixtureHTML();
 html=html.replaceAll('[100,100]','[250,100]').replaceAll('translate(100px,100px)','translate(250px,100px)')
  .replaceAll('[112,105]','[450,110]').replaceAll('translate(112px,105px)','translate(450px,110px)');
 await page.setContent(html);
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(async()=>{await mapLayout.ready;mapLayout.requestView({x:100,y:50,w:250,h:200});await mapLayout.whenSettled();});
}

test('panning under controls hides a label instead of moving or rewrapping it',async({page})=>{
 await mount(page);
 const result=await page.evaluate(async()=>{
  const l=mapLayout,view={...l.view},e=l.elements.get('label-0'),read=()=>({transform:e.getAttribute('transform'),html:e.querySelector('text').innerHTML});
  const before=read(),p=l.result.placements.find(p=>p.id==='label-0'),b=p.footprint.bounds,c=document.querySelector('.ctl').getBoundingClientRect(),s=l.svg.getScreenCTM().a;
  l.requestView({...view,x:view.x-(c.x+c.width/2-b.x-b.width/2)/s,y:view.y-(c.y+c.height/2-b.y-b.height/2)/s});
  await l.whenSettled();const covered={visible:l.visibleIds.has('label-0'),...read()};
  l.requestView(view);await l.whenSettled();
  return {before,covered,after:{visible:l.visibleIds.has('label-0'),...read()}};
 });
 expect(result.covered.visible).toBe(false);
 expect(result.after).toEqual({visible:true,...result.before});
});

test('labels revealed by a pan can appear without changing existing placements',async({page})=>{
 await mount(page);
 const result=await page.evaluate(async()=>{
  const l=mapLayout,view={...l.view},snapshot=()=>Object.fromEntries([...l.visibleIds].map(id=>{const e=l.elements.get(id);return [id,{transform:e.getAttribute('transform'),html:e.querySelector('text')?.innerHTML}];}));
  const before=snapshot();l.requestView({...view,x:250});await l.whenSettled();const revealed=l.visibleIds.has('label-1');
  l.requestView(view);await l.whenSettled();const after=snapshot();
  return {before,after,revealed};
 });
 expect(result.before['label-1']).toBeUndefined();expect(result.revealed).toBe(true);
 for(const [id,placement] of Object.entries(result.before))expect(result.after[id]).toEqual(placement);
});

test('a zoom still prepares fresh label positions',async({page})=>{
 await mount(page);
 const calls=await page.evaluate(async()=>{const l=mapLayout;let calls=0;const normalize=l.normalize.bind(l);l.normalize=(...args)=>{calls++;return normalize(...args);};l.requestView({...l.view,w:200,h:160});await l.whenSettled();return calls;});
 expect(calls).toBeGreaterThan(0);
});

test('pure pan frames reuse measured footprints without querying trails again',async({page})=>{
 await mount(page);
 const calls=await page.evaluate(()=>{const l=mapLayout;let calls=0;const query=l.trailQuery.bind(l);l.trailQuery=(...args)=>{calls++;return query(...args);};l.view={...l.view,x:l.view.x+1};l.render(false);return calls;});
 expect(calls).toBe(0);
});

test('returning from a transient zoom restores the fixed placement before panning',async({page})=>{
 await mountFixture(page);await page.evaluate(()=>mapLayout.whenSettled());
 const result=await page.evaluate(()=>{const l=mapLayout,p=l.result.placements.find(p=>Math.hypot(p.dx??0,p.dy??0)>0),e=p&&l.elements.get(p.id);if(!e)return {displaced:false};const view={...l.view},before=e.getAttribute('transform');l.view={...view,w:400,h:320};l.render(false);l.view=view;l.render(false);return {displaced:true,before,after:e.getAttribute('transform')};});
 expect(result.displaced).toBe(true);
 expect(result.after).toBe(result.before);
});

test('changing annotation layers invalidates the old placement reservations',async({page})=>{
 await mount(page);
 const result=await page.evaluate(async()=>{const l=mapLayout;let calls=0;const normalize=l.normalize.bind(l);l.normalize=(...args)=>{calls++;return normalize(...args);};l.setLayer('names',false);await l.whenSettled();return {calls,curve:l.visibleIds.has('curve')};});
 expect(result.calls).toBeGreaterThan(0);expect(result.curve).toBe(false);
});

test('a held pointer keeps slow pan steps on the fast path until release',async({page})=>{
 await mount(page);
 const result=await page.evaluate(async()=>{
  const l=mapLayout,svg=l.svg;let settled=0;const render=l.render.bind(l);l.render=(full)=>{if(full)settled++;return render(full);};
  svg.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,bubbles:true,button:0}));
  for(let i=0;i<3;i++){l.requestView({...l.view,x:l.view.x+1});await new Promise(r=>setTimeout(r,80));}
  const during=settled;svg.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}));await l.whenSettled();return {during,after:settled};
 });
 expect(result.during).toBe(0);expect(result.after).toBeGreaterThan(0);
});

test('wheel bursts do not run full layout between closely spaced inputs',async({page})=>{
 await mount(page);
 const result=await page.evaluate(async()=>{
  const l=mapLayout;let settled=0;const render=l.render.bind(l);l.render=(full)=>{if(full)settled++;return render(full);};
  for(let i=0;i<3;i++){l.svg.dispatchEvent(new WheelEvent('wheel',{deltaY:-20,bubbles:true}));l.requestView({...l.view,w:l.view.w*.99,h:l.view.h*.99});await new Promise(r=>setTimeout(r,50));}
  const during=settled;await l.whenSettled();return {during,after:settled};
 });
 expect(result.during).toBe(0);expect(result.after).toBeGreaterThan(0);
});

for(const event of ['pointercancel','lostpointercapture','blur'])test(`${event} releases a pending gesture settlement`,async({page})=>{
 await mount(page);
 const result=await page.evaluate(async event=>{
  const l=mapLayout;l.svg.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,bubbles:true,button:0}));l.requestView({...l.view,x:l.view.x+1});
  let resolved=false;const pending=l.whenSettled().then(()=>{resolved=true;});await new Promise(r=>setTimeout(r,80));const during=resolved;
  if(event==='blur')window.dispatchEvent(new Event(event));else l.svg.dispatchEvent(new PointerEvent(event,{pointerId:7,bubbles:true}));
  await pending;return {during,after:resolved,kind:l.transactionKind};
 },event);
 expect(result).toEqual({during:false,after:true,kind:'settled'});
});

test('pointer clicks without a camera change do not schedule full layout',async({page})=>{
 await mount(page);
 const calls=await page.evaluate(async()=>{const l=mapLayout;let calls=0;const render=l.render.bind(l);l.render=full=>{if(full)calls++;return render(full);};l.svg.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,bubbles:true,button:0}));l.svg.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}));await new Promise(r=>setTimeout(r,100));return calls;});
 expect(calls).toBe(0);
});

test('secondary button drags accepted by the builder also defer full layout',async({page})=>{
 await mount(page);
 const during=await page.evaluate(async()=>{const l=mapLayout;let calls=0;const render=l.render.bind(l);l.render=full=>{if(full)calls++;return render(full);};l.svg.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,bubbles:true,button:2}));l.requestView({...l.view,x:l.view.x+1});await new Promise(r=>setTimeout(r,100));const during=calls;l.svg.dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true,button:2}));await l.whenSettled();return during;});
 expect(during).toBe(0);
});
