import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
test('deferred preparation yields with hidden detail restored and completes all geometry',async({page})=>{
 const bundle=await build({stdin:{contents:"import {ContourPreview} from './pipeline/labels/contour-preview.js';window.TestContourPreview=ContourPreview;",resolveDir:process.cwd()},bundle:true,write:false});
 await page.setContent('<style>.g-fine{display:none}path{fill:none;stroke:black}</style><svg id="mapsvg" viewBox="0 0 500 400"><g class="contours"><g class="g-fine">'+Array.from({length:40},(_,i)=>`<path d="M0,${i} 50,${i+1} 100,${i}"/>`).join('')+'</g></g></svg>');
 await page.addScriptTag({content:bundle.outputFiles[0].text});
 const result=await page.evaluate(async()=>{
  let tick=0;Object.defineProperty(performance,'now',{configurable:true,value:()=>tick+=9});
  const p=new TestContourPreview(document.getElementById('mapsvg'),{width:500,height:400},{defer:true});
  const during={ready:p.initialized,detail:getComputedStyle(document.querySelector('.g-fine')).display};
  delete performance.now;await p.ready;
  return {during,ready:p.initialized,count:p.items.length,points:p.items.reduce((sum,item)=>sum+item.runs.reduce((n,r)=>n+r.points.length/2,0),0)};
 });
 expect(result).toEqual({during:{ready:false,detail:'none'},ready:true,count:40,points:120});
});
test('a transient zero-size viewport cannot poison the contour raster and recovers on resize',async({page})=>{
 const bundle=await build({stdin:{contents:"import {ContourPreview} from './pipeline/labels/contour-preview.js';window.TestContourPreview=ContourPreview;",resolveDir:process.cwd()},bundle:true,write:false});
 await page.setContent('<style>path{fill:none;stroke:black}</style><svg id="mapsvg" viewBox="0 0 500 400"><g class="contours"><path d="M0,100 L500,300"/></g></svg>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 const result=await page.evaluate(async()=>{const p=new TestContourPreview(document.getElementById('mapsvg'),{width:500,height:400});await p.ready;const view={x:0,y:0,w:500,h:400},budget=8*1024*1024;p.render(view,{width:500,height:400},budget);const first=p.element.getAttribute('transform');p.render(view,{width:0,height:0},budget);const hidden=p.element.getAttribute('transform');p.render({...view,w:250,h:200},{width:400,height:320},budget);return{first,hidden,recovered:p.element.getAttribute('transform'),finite:Object.values(p.cached).filter(v=>typeof v==='number').every(Number.isFinite),bytes:p.rgbaBytes}});
 expect(errors).toEqual([]);expect(result.hidden).toBe(result.first);expect(result.recovered).not.toMatch(/Infinity|NaN/);expect(result.recovered).not.toBe(result.first);expect(result.finite).toBe(true);expect(result.bytes).toBeGreaterThan(0);
});
