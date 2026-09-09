import {test,expect} from '@playwright/test';
import {mountFixture} from '../support/browser-fixture.js';
import {build} from 'esbuild';
for(const canvasInk of [false,true])test(`${canvasInk?'Canvas':'SVG'} wrapped baselines retain measured primary and secondary spacing across font changes`,async({page})=>{
 await page.setContent('<svg width="600" height="400"><g id="source"><text x="50" y="100" style="font-family:serif"></text></g><g id="target"><text x="50" y="100" style="font-family:serif"></text></g></svg>');
 const source=(await build({stdin:{contents:"import {measurePointVariants} from './pipeline/labels/point-variants.js';import {measureElement} from './pipeline/labels/measure.js';window.variantTest={measurePointVariants,measureElement};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
 await page.addScriptTag({content:source});
 const results=await page.evaluate(canvasInk=>{
  const annotation={text:'Example Creek Trailhead',variants:[{lines:['Example','Creek','Trailhead']}]},target=document.querySelector('#target text'),source=document.querySelector('#source text'),results=[];
  for(const secondary of [false,true])for(const [previous,next] of [[16.420322,20.525403],[16.420322,24.630484],[24.630484,16.420322]]){
   const original=size=>'Example Creek Trailhead'+(secondary?`<tspan x="50" dy="${size*.65*1.3}" style="font-size:${size*.65}px">1,234 ft</tspan>`:'');
   source.style.fontSize=next+'px';source.innerHTML=original(next);
   target.style.fontSize=previous+'px';target.innerHTML=original(previous);
   target.innerHTML=variantTest.measurePointVariants(document.getElementById('target'),annotation,{canvasInk})[0].textHTML;
   target.getBBox();target.getStartPositionOfChar(16);
   const variant=variantTest.measurePointVariants(document.getElementById('source'),annotation,{canvasInk})[0];
   // The controller can retain identical wrap HTML, then normalize its font.
   if(target.innerHTML!==variant.textHTML)target.innerHTML=variant.textHTML;target.style.fontSize=next+'px';
   for(const sub of target.querySelectorAll('tspan:not([data-layout-primary])')){sub.style.fontSize=next*.65+'px';sub.setAttribute('dy',String(next*.65*1.3));}
   results.push({secondary,next,measured:variant.shape,actual:variantTest.measureElement(document.getElementById('target'),.35,{canvasInk}),fontSize:getComputedStyle(target).fontSize,text:target.textContent});
  }
  return results;
 },canvasInk);
 for(const result of results){
  expect(parseFloat(result.fontSize)).toBeCloseTo(result.next,4);
  expect(result.actual.parts).toHaveLength(result.secondary?4:3);
  if(result.secondary)expect(result.text).toContain('1,234 ft');
  result.actual.parts.forEach((part,i)=>{expect(part.y).toBeCloseTo(result.measured.parts[i].y,3);expect(part.height).toBeCloseTo(result.measured.parts[i].height,3);});
 }
});
test('declared wrapping preserves every word and measures each line',async({page})=>{
 await mountFixture(page,'static');
 await page.evaluate(()=>{const a=mapLayout.manifest.annotations[0];a.variants=[{lines:['Camp','A']}];mapLayout.cache.invalidate();mapLayout.render(true);});
 const variants=await page.evaluate(()=>mapLayout.prepared[0].candidates.filter(c=>c.textHTML));
 expect(variants.length).toBeGreaterThan(0);expect(variants[0].textHTML).toContain('Camp');expect(variants[0].textHTML).toContain('>A<');
});
