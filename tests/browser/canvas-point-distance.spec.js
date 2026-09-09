import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {fixtureHTML} from '../support/browser-fixture.js';
import {collectManagedInventory} from '../support/managed-map-adapter.js';

// Compare candidate placement to independent Canvas glyph ink, not to the SVG
// advance/em box that can extend toward the anchor beyond any painted pixel.
test('Canvas point candidates obey the painted distance bound at fractional font sizes',async({page})=>{
 await page.setContent(await fixtureHTML());
 await page.evaluate(()=>document.querySelector('#mapsvg').innerHTML='<g id="ink"><text x="100" y="100" style="font-size:15.67px;font-weight:600;stroke:black;stroke-width:2.8px;stroke-linejoin:round">Cottonwood Campground</text></g>');
 const source=(await build({stdin:{contents:"import {measureElement,ensureFonts} from './pipeline/labels/measure.js';import {pointCandidates} from './pipeline/labels/candidates.js';window.metricTest={measureElement,ensureFonts,pointCandidates};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
 await page.addScriptTag({content:source});await page.evaluate(()=>metricTest.ensureFonts());
 const result=await page.evaluate(()=>{
  const {measureElement,pointCandidates}=metricTest,e=document.getElementById('ink'),text=e.querySelector('text'),context=document.createElement('canvas').getContext('2d'),anchor=[100,100],failures=[],measurements=[];
  for(const size of [14,15.67,16.52]){
   text.style.fontSize=size+'px';const metric=measureElement(e,0,{canvasInk:true}),svg=measureElement(e),style=getComputedStyle(text),m=text.getScreenCTM(),halo=parseFloat(style.strokeWidth)/2;
   context.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;context.fontKerning='none';
   const rectangles=[];
   for(let i=0;i<text.getNumberOfChars();i++){
    if(!text.textContent[i]?.trim())continue;const ink=context.measureText(text.textContent[i]);if(!ink.actualBoundingBoxLeft&&!ink.actualBoundingBoxRight&&!ink.actualBoundingBoxAscent&&!ink.actualBoundingBoxDescent)continue;
    const p=text.getStartPositionOfChar(i);
    rectangles.push({left:m.a*(p.x-ink.actualBoundingBoxLeft)+m.e-halo,right:m.a*(p.x+ink.actualBoundingBoxRight)+m.e+halo,top:m.d*(p.y-ink.actualBoundingBoxAscent)+m.f-halo,bottom:m.d*(p.y+ink.actualBoundingBoxDescent)+m.f+halo});
   }
   const actual={left:Math.min(...rectangles.map(r=>r.left)),right:Math.max(...rectangles.map(r=>r.right)),top:Math.min(...rectangles.map(r=>r.top)),bottom:Math.max(...rectangles.map(r=>r.bottom))};
   const candidates=pointCandidates({kind:'point-label',anchor},metric,{densePointCandidates:true,densePointStep:2,maxPointDisplacement:32,pointPaintReserve:.125});
   let maximum=0;
   for(const c of candidates){const distance=Math.hypot(Math.max(actual.left+c.dx-anchor[0],0,anchor[0]-actual.right-c.dx),Math.max(actual.top+c.dy-anchor[1],0,anchor[1]-actual.bottom-c.dy));maximum=Math.max(maximum,distance);if(distance>31.875+1e-6)failures.push({size,candidate:c.id,distance});}
   measurements.push({size,svg:svg.bounds,canvas:metric.bounds,actual,maximum,candidates:candidates.length});
  }
  return {failures:failures.slice(0,8),measurements};
 });
 expect(result.failures,JSON.stringify(result.measurements)).toEqual([]);
 for(const m of result.measurements){expect(m.candidates).toBeGreaterThan(100);expect(m.canvas.height).toBeLessThan(m.svg.height);}
});

test('Canvas glyph footprints omit space advances and retain combining-mark ink',async({page})=>{
 await page.setContent(await fixtureHTML());
 await page.evaluate(()=>document.querySelector('#mapsvg').innerHTML='<g id="ink"><text x="100" y="100" transform="rotate(15 100 100)" style="font-size:16.52px;font-weight:600;stroke:black;stroke-width:2.8px;stroke-linejoin:round">Á B</text></g>');
 const source=(await build({stdin:{contents:"import {measureElement,ensureFonts} from './pipeline/labels/measure.js';window.metricTest={measureElement,ensureFonts};",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'})).outputFiles[0].text;
 await page.addScriptTag({content:source});await page.evaluate(()=>metricTest.ensureFonts());
 const result=await page.evaluate(()=>{
  const e=document.getElementById('ink'),text=e.querySelector('text'),m=metricTest.measureElement(e,0,{canvasInk:true}),ctx=document.createElement('canvas').getContext('2d'),style=getComputedStyle(text);
  ctx.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const glyphs=[...Array(text.getNumberOfChars()).keys()].map(i=>{const t=ctx.measureText(text.textContent[i]);return {char:text.textContent[i],painted:!!text.textContent[i].trim()&&!!(t.actualBoundingBoxLeft+t.actualBoundingBoxRight||t.actualBoundingBoxAscent+t.actualBoundingBoxDescent)};});
  ctx.fillText(' ',50,50);ctx.lineWidth=2.8;ctx.strokeText(' ',50,50);
  const spacePainted=ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height).data.some((value,i)=>i%4===3&&value>0);
  return {parts:m.parts,glyphs,spacePainted};
 });
 expect(result.spacePainted).toBe(false);
 expect(result.glyphs.find(g=>g.char===' ').painted).toBe(false);
 expect(result.glyphs.find(g=>g.char==='́').painted).toBe(true);
 expect(result.parts).toHaveLength(result.glyphs.filter(g=>g.painted).length);
 for(const p of result.parts){expect(Object.values(p).every(Number.isFinite)).toBe(true);expect(p.width).toBeGreaterThan(0);expect(p.height).toBeGreaterThan(0);}
});


test('independent Canvas audit ignores unpainted whitespace commands',async({page})=>{
 await page.setContent(await fixtureHTML());
 await page.evaluate(()=>{window.mapLayout={view:{x:0,y:0,w:500,h:400},renderer:{active:true,paintViewport:{x:0,y:0},painted:[{id:'label-0',offset:[0,0],commands:[{kind:'glyph',text:' ',matrix:[1,0,0,1,100,100],style:{font:'20px sans-serif',fontSize:20,fill:'black',stroke:'none',width:0,opacity:1,join:'round'}}]}]}};});
 expect((await page.evaluate(collectManagedInventory)).inventory.find(a=>a.id==='label-0')).toBeUndefined();
 await page.evaluate(()=>mapLayout.renderer.painted[0].commands[0].text='A');
 expect((await page.evaluate(collectManagedInventory)).inventory.find(a=>a.id==='label-0')?.polygons.length).toBeGreaterThan(0);
});
