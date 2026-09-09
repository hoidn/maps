import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {fixtureHTML} from '../support/browser-fixture.js';
let runtime;
test.beforeAll(async()=>{
 runtime=(await build({entryPoints:['pipeline/labels/browser.js'],bundle:true,loader:{'.txt':'text'},format:'iife',write:false})).outputFiles[0].text;
});
for(const backend of ['svg','canvas'])test(`${backend} retries an empty line cache when zoom makes the path usable`,async({page})=>{
 const html=(await fixtureHTML()).replace('id="mapsvg"',`id="mapsvg" data-renderer="${backend}"`).replace('M20,250 Q200,100 470,250','M200,200 L215,200');
 await page.setContent(html);await page.addScriptTag({content:runtime});
 await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();});
 const result=await page.evaluate(async()=>{
  const l=mapLayout,before=l.lineCache.get('curve').candidates.length;
  l.requestView({x:190,y:185,w:50,h:40});await l.whenSettled();
  const after=l.lineCache.get('curve').candidates.length,visible=l.visibleIds.has('curve');
  // Same font and view provide the counterfactual: a fresh measurement fits.
  l.setTextScale(l.textScale);await l.whenSettled();
  return {before,after,visible,fresh:l.lineCache.get('curve').candidates.length,freshVisible:l.visibleIds.has('curve')};
 });
 expect(result.before).toBe(0);
 expect(result.fresh).toBeGreaterThan(0);expect(result.freshVisible).toBe(true);
 expect(result.after).toBeGreaterThan(0);expect(result.visible).toBe(true);
});
