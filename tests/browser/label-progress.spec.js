import {test,expect} from '@playwright/test';
import {mountFixture} from '../support/browser-fixture.js';
test('idle settling eventually prepares a named line after the startup budget expires',async({page})=>{
 await mountFixture(page);
 const r=await page.evaluate(async()=>{const l=mapLayout;l.policy.interactiveCandidateBudgetMs=0;l.lineCache.clear();l.cache.invalidate();l.invalidateLayout();l.scheduleSettled(0);await l.whenSettled();return{cached:l.lineCache.has('curve'),placed:l.result.placements.some(p=>p.id==='curve'),reason:l.result.outcomes.find(o=>o.id==='curve')?.reason};});
 expect(r.cached).toBe(true);expect(r.placed).toBe(true);expect(r.reason).toBe('placed');
});
