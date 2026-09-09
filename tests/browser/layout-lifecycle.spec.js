import {test,expect} from '@playwright/test';
import {mountFixture,visibleBoxes} from '../support/browser-fixture.js';
test('positions crowded labels and accounts for the whole inventory',async({page})=>{
 await mountFixture(page);const boxes=await visibleBoxes(page);
 expect(boxes.filter(b=>b.id.startsWith('label')).length).toBe(2);
 for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++) {
  const a=boxes[i],b=boxes[j];expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,`${a.id}/${b.id}`).toBe(true);
 }
 const report=await page.evaluate(()=>window.mapLayout.getReport());expect(report.outcomes.length).toBe(3);expect(report.status).toBe('ready');
});
test('hidden places remain selectable through the feature directory',async({page})=>{
 await mountFixture(page);await page.evaluate(()=>window.mapLayout.setLayer('places',false));
 await page.evaluate(()=>window.mapLayout.whenSettled());
 expect((await visibleBoxes(page)).filter(b=>b.id.startsWith('label'))).toHaveLength(0);
 await page.evaluate(()=>window.mapLayout.select('f-a'));
 await expect(page.locator('[data-layout-details]')).toContainText('Camp A');
});
