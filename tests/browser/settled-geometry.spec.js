import {test,expect} from '@playwright/test';
import {mountFixture} from '../support/browser-fixture.js';

test('viewport resizing refreshes inverse font scaling without changing viewBox',async({page})=>{
 await mountFixture(page);await page.evaluate(()=>mapLayout.whenSettled());
 await page.setViewportSize({width:360,height:800});await page.evaluate(()=>mapLayout.whenSettled());
 await expect.poll(()=>page.evaluate(()=>{const l=mapLayout,m=l.svg.getScreenCTM();return Number(l.fontScaleValue)*Math.hypot(m.a,m.b);})).toBeCloseTo(1,5);
});

test('settled curved text paints at the screen size measured after zoom',async({page})=>{
 await mountFixture(page);await page.evaluate(()=>mapLayout.whenSettled());
 const result=await page.evaluate(async()=>{const l=mapLayout,t=l.elements.get('curve').querySelector('text'),size=()=>parseFloat(getComputedStyle(t).fontSize)*Math.hypot(t.getScreenCTM().a,t.getScreenCTM().b);const before=size();l.requestView({x:0,y:0,w:250,h:200});await l.whenSettled();return {before,after:size(),placed:l.visibleIds.has('curve')};});
 expect(result.placed).toBe(true);expect(result.after).toBeCloseTo(result.before,4);
});

test('an unwrapped placement replaces previously wrapped painted text',async({page})=>{
 await mountFixture(page);await page.evaluate(()=>mapLayout.whenSettled());
 const result=await page.evaluate(async()=>{const l=mapLayout,a=l.byId.get('label-0'),e=l.elements.get(a.id);e.querySelector('text').innerHTML='<tspan>Camp</tspan><tspan>A</tspan>';l.invalidateLayout();l.cache.invalidate();l.requestView({x:0,y:0,w:400,h:320});await l.whenSettled();const p=l.result.placements.find(p=>p.id===a.id);return {placed:!!p,variant:p?.textHTML,actual:e.querySelector('text').innerHTML,expected:a.originalTextHTML};});
 expect(result.placed).toBe(true);expect(result.variant).toBeUndefined();expect(result.actual).toBe(result.expected);
});

test('controls changing during yielded preparation discard that layout',async({page})=>{
 await mountFixture(page);await page.evaluate(()=>mapLayout.whenSettled());
 const result=await page.evaluate(async()=>{const l=mapLayout;l.observer.disconnect();l.invalidateLayout();l.cache.invalidate();const normalize=l.normalize.bind(l);l.normalize=(...args)=>{normalize(...args);const end=performance.now()+10;while(performance.now()<end){}};setTimeout(()=>{document.querySelector('.ctl').style.width='100px';},0);return l.render(true);});
 expect(result).toBe(false);
});

test('retry after map movement uses footprints from the new screen position',async({page})=>{
 await mountFixture(page);await page.evaluate(()=>mapLayout.whenSettled());
 const result=await page.evaluate(async()=>{
  const l=mapLayout;l.observer.disconnect();l.invalidateLayout();l.cache.invalidate();const normalize=l.normalize.bind(l);
  l.normalize=(...args)=>{normalize(...args);const end=performance.now()+10;while(performance.now()<end){}};
  setTimeout(()=>{l.svg.parentElement.style.marginLeft='30px';},0);
  const rejected=await l.render(true);l.normalize=normalize;await l.render(true);
  const errors=l.result.placements.filter(p=>!p.application).map(p=>{const r=l.elements.get(p.id).getBoundingClientRect(),b=p.footprint.bounds;return Math.abs((r.x+r.width/2)-(b.x+b.width/2));});
  return {rejected,errors};
 });
 expect(result.rejected).toBe(false);expect(result.errors.length).toBeGreaterThan(0);for(const error of result.errors)expect(error).toBeLessThan(0.1);
});
