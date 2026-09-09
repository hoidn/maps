import {test,expect} from '@playwright/test';
import {mountFixture} from '../support/browser-fixture.js';
test('idle settling eventually prepares a named line after the startup budget expires',async({page})=>{
 await mountFixture(page);
 const r=await page.evaluate(async()=>{const l=mapLayout;l.policy.interactiveCandidateBudgetMs=0;l.lineCache.clear();l.cache.invalidate();l.invalidateLayout();l.scheduleSettled(0);await l.whenSettled();return{cached:l.lineCache.has('curve'),placed:l.result.placements.some(p=>p.id==='curve'),reason:l.result.outcomes.find(o=>o.id==='curve')?.reason};});
 expect(r.cached).toBe(true);expect(r.placed).toBe(true);expect(r.reason).toBe('placed');
});
test('startup reservations remain provisional until full idle preparation',async({page})=>{
 await mountFixture(page);const r=await page.evaluate(async()=>{const l=mapLayout;await l.whenSettled();l.panLayout.provisional=true;l.starting=false;const fixed=l.fixedPlacements(l.svg.getScreenCTM(),l.panKey(l.svg.getScreenCTM(),l.lastViewport),true);return fixed===null});expect(r).toBe(true);
});
test('idle preparation skips line windows wholly outside the view',async({page})=>{
 await mountFixture(page);const r=await page.evaluate(async()=>{const l=mapLayout;await l.whenSettled();const a=l.manifest.annotations.find(a=>a.id==='curve');a.geometryBounds=[1000,1000,1200,1200];l.elements.get('curve').querySelector('textPath')?.setAttribute('href','#waterpath');document.getElementById('waterpath').setAttribute('d','M1000,1000 L1200,1200');l.lineCache.clear();l.invalidateLayout();l.scheduleSettled(0);await l.whenSettled();return{reason:l.prepared.find(a=>a.id==='curve').eligibleReason,cached:l.lineCache.has('curve')}});expect(r).toEqual({reason:'outside-view',cached:false});
});
