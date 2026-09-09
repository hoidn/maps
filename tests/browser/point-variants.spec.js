import {test,expect} from '@playwright/test';
import {mountFixture} from '../support/browser-fixture.js';
test('declared wrapping preserves every word and measures each line',async({page})=>{
 await mountFixture(page,'static');
 await page.evaluate(()=>{const a=mapLayout.manifest.annotations[0];a.variants=[{lines:['Camp','A']}];mapLayout.cache.invalidate();mapLayout.render(true);});
 const variants=await page.evaluate(()=>mapLayout.prepared[0].candidates.filter(c=>c.textHTML));
 expect(variants.length).toBeGreaterThan(0);expect(variants[0].textHTML).toContain('Camp');expect(variants[0].textHTML).toContain('>A<');
});
