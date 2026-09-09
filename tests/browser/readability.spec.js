import {test,expect} from '@playwright/test';
import {mountFixture} from '../support/browser-fixture.js';
test('zoom enlarges labels up to a cap, while panning preserves size and wrapping',async({page})=>{
 await mountFixture(page);
 const r=await page.evaluate(async()=>{const l=mapLayout;await l.whenSettled();const t=l.elements.get('label-0').querySelector('text'),read=()=>({pixels:parseFloat(getComputedStyle(t).fontSize)*Math.hypot(t.getScreenCTM().a,t.getScreenCTM().b),html:t.innerHTML});const base=read();l.requestView({x:50,y:60,w:125,h:100});await l.whenSettled();const zoom=read();l.requestView({...l.view,x:51});await l.whenSettled();const pan=read();l.requestView({x:85,y:85,w:500/14,h:400/14});await l.whenSettled();return{base,zoom,pan,deep:read()}});
 expect(r.base.pixels).toBeGreaterThanOrEqual(13.9);expect(r.zoom.pixels).toBeGreaterThan(r.base.pixels+1);expect(r.pan.pixels).toBeCloseTo(r.zoom.pixels,3);expect(r.pan.html).toBe(r.zoom.html);expect(r.deep.pixels).toBeLessThanOrEqual(17);
});
test('readability preference remeasures primary and secondary text',async({page})=>{
 await mountFixture(page);expect(await page.evaluate(()=>typeof mapLayout.setTextScale)).toBe('function');
 const r=await page.evaluate(async()=>{const l=mapLayout;await l.whenSettled();l.setTextScale(1.25);await l.whenSettled();const t=l.elements.get('label-0').querySelector('text'),m=t.getScreenCTM();return parseFloat(getComputedStyle(t).fontSize)*Math.hypot(m.a,m.b)});expect(r).toBeGreaterThanOrEqual(17.4);
});
