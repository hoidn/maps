import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {fixtureHTML} from '../support/browser-fixture.js';
async function mount(page){
 await page.setContent((await fixtureHTML()).replace('id="mapsvg"','id="mapsvg" data-renderer="canvas"'));
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(()=>mapLayout.whenSettled());
}
test('stylesheet synchronization does not invalidate unchanged embedded font faces',async({page})=>{
 await mount(page);
 const state=await page.evaluate(async()=>{
  const l=mapLayout,faces=[...document.fonts],generation=l.fontGeneration??0,painted=l.renderer.painted.map(p=>p.id);
  // This is Playwright WebKit's actual screenshot animation synchronization.
  // WebKit may mark unused loaded faces unloaded without replacing the faces
  // or dispatching a real FontFaceSet loading cycle.
  const style=document.createElement('style');style.textContent='body {}';document.head.append(style);document.documentElement.getBoundingClientRect();style.remove();
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  return {generation:l.fontGeneration??0,before:generation,sameFaces:[...document.fonts].every((f,i)=>f===faces[i]),painted:l.renderer.painted.map(p=>p.id),beforePainted:painted};
 });
 expect(state.sameFaces).toBe(true);
 expect(state.generation).toBe(state.before);
 expect(state.painted).toEqual(state.beforePainted);
});
test('replacing embedded font faces still triggers recovery and repaint',async({page})=>{
 await mount(page);
 const before=await page.evaluate(()=>{window.oldFaces=[...document.fonts];const before=mapLayout.fontGeneration??0;const style=[...document.querySelectorAll('style')].find(e=>e.textContent.includes('@font-face'));style.textContent+='\n/* replace stylesheet font faces */';return before;});
 await expect.poll(()=>page.evaluate(()=>mapLayout.fontGeneration??0)).toBeGreaterThan(before);
 await page.evaluate(()=>mapLayout.whenSettled());
 expect(await page.evaluate(()=>[...document.fonts].some(f=>!oldFaces.includes(f)))).toBe(true);
 expect(await page.evaluate(()=>({status:mapLayout.status,painted:mapLayout.renderer.painted.length>0}))).toEqual({status:'ready',painted:true});
});
test('removing a required font face still fails closed',async({page})=>{
 await mount(page);
 await page.evaluate(()=>{for(const style of document.querySelectorAll('style'))style.textContent=style.textContent.replace(/@font-face\s*\{[^}]*\}/g,rule=>rule.includes('Source Sans 3')?'':rule);});
 await expect.poll(()=>page.evaluate(()=>mapLayout.status)).toBe('error');
 expect(await page.evaluate(()=>mapLayout.renderer.painted.length)).toBe(0);
});
