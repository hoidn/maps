import {test,expect} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import {loadAuditFonts} from '../../scripts/audit-fonts.js';
test('audit explicitly reloads declared hidden faces after stylesheet synchronization',async({page})=>{
 await page.setContent(await fixtureHTML());
 const families=['Alegreya','Source Sans 3','Bree Serif'];
 await page.evaluate(loadAuditFonts,families);
 await page.evaluate(()=>{const style=document.createElement('style');style.textContent='body {}';document.head.append(style);document.documentElement.getBoundingClientRect();style.remove();});
 await page.evaluate(loadAuditFonts,families);
 expect(await page.evaluate(()=>[...document.fonts].map(face=>face.status))).not.toContain('unloaded');
 expect(await page.evaluate(()=>[...document.fonts].map(face=>face.status))).not.toContain('error');
});
test('audit font precondition rejects missing and broken declared families',async({page})=>{
 await page.setContent('<p>Font audit fixture</p>');
 await expect(page.evaluate(loadAuditFonts,['Missing Family'])).rejects.toThrow('Missing audit font family');
 await page.evaluate(()=>document.fonts.add(new FontFace('Broken Family','url(data:font/woff2;base64,bm90IGEgZm9udA==)')));
 await expect(page.evaluate(loadAuditFonts,['Broken Family'])).rejects.toThrow();
});
