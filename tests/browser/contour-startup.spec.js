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
