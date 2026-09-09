import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
let bundle;
test.beforeAll(async()=>{bundle=(await build({stdin:{contents:"export * from './pipeline/labels/line-candidates.js';export {measureElement} from './pipeline/labels/measure.js'",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'hydro'})).outputFiles[0].text});
for(const [label,d] of [['westward','M480,180 L20,180'],['winding','M20,180 '+Array.from({length:60},(_,i)=>`${28+i*7},${i%2?185:175}`).join(' ')]]){
 test(`${label} water has upright readable alternatives without moving geography`,async({page})=>{
  await page.setContent(`<svg width="600" height="400" viewBox="0 0 600 400"><defs><path id="river" d="${d}"/></defs><g id="label"><text font-size="15" dy="-4"><textPath href="#river" text-anchor="middle" startOffset="120%">Example Creek</textPath></text></g></svg>`);await page.addScriptTag({content:bundle});
  const r=await page.evaluate(()=>{const e=document.getElementById('label'),p=document.getElementById('river'),before=e.outerHTML,d=p.getAttribute('d'),diagnostics={},cs=hydro.buildLineCandidates({annotation:{geometryId:'river',style:'l-hydro',text:'Example Creek'},element:e,policy:{maxLineCandidates:4},diagnostics});const restored=e.outerHTML===before;let valid=true;for(const c of cs){hydro.applyLineCandidate(e,c);const b=hydro.measureElement(e).bounds;valid&&=Math.abs(b.x-c.shape.bounds.x)<.01&&Math.abs(b.y-c.shape.bounds.y)<.01;}return{count:cs.length,restored,valid,samePath:d===p.getAttribute('d'),diagnostics}});
  expect(r.count).toBeGreaterThan(0);expect(r.restored).toBe(true);expect(r.samePath).toBe(true);expect(r.valid).toBe(true);expect(r.diagnostics.measuredCandidates).toBeGreaterThan(0);
 });
}
test('a curved candidate restores textPath after a prior straight fallback',async({page})=>{
 await page.setContent('<svg width="600" height="400"><defs><path id="river" d="M20,180 L500,180"/></defs><g id="label"><text font-size="15"><textPath href="#river" text-anchor="middle" startOffset="50%">Example Creek</textPath></text></g></svg>');await page.addScriptTag({content:bundle});
 const r=await page.evaluate(()=>{const e=document.getElementById('label'),cs=hydro.buildLineCandidates({annotation:{geometryId:'river',style:'l-hydro'},element:e});e.querySelector('text').textContent='Example Creek';try{hydro.applyLineCandidate(e,cs[0]);return{path:!!e.querySelector('textPath'),text:e.textContent}}catch(error){return{error:error.message}}});expect(r).toEqual({path:true,text:'Example Creek'});
});

for(const style of ['l-trail','l-road','l-road-ref'])test(`${style} westward label has a readable alternative`,async({page})=>{
 await page.setContent('<svg width="600" height="400"><defs><path id="route" d="M480,180 L20,180"/></defs><g id="label"><text font-size="15"><textPath href="#route" startOffset="50%">Arbitrary Route</textPath></text></g></svg>');await page.addScriptTag({content:bundle});
 const count=await page.evaluate(style=>hydro.buildLineCandidates({annotation:{geometryId:'route',style},element:document.getElementById('label')}).length,style);expect(count).toBeGreaterThan(0);
});
