import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
let code;
test.beforeAll(async()=>{code=(await build({stdin:{contents:"export {captureCommands,paintCommands,createPaintState} from './pipeline/render/scene.js'",resolveDir:process.cwd()},bundle:true,write:false,format:'iife',globalName:'paintFixture'})).outputFiles[0].text;});
for(const dpr of [1,2])test(`draw-local Canvas styles preserve exact reference pixels through theme, dimming and DPR ${dpr} resets`,async({page})=>{
 await page.setContent(`<style>svg{position:absolute;left:0;top:0}path{stroke:#964830;stroke-width:3;stroke-dasharray:4 2;fill:none}#area{fill:#a1b59a;stroke:#796686;stroke-linejoin:miter;stroke-dasharray:8 3 2 3;fill-rule:evenodd}text{font:18px serif;fill:#242424;stroke:#f2eadc;stroke-width:3;paint-order:stroke fill}.dark path{stroke:#db9c87}.dark #area{fill:#344b3f;stroke:#aa8ea9}.dark text{fill:#eee;stroke:#222}</style>
 <svg id="map" xmlns="http://www.w3.org/2000/svg" width="160" height="120" viewBox="0 0 160 120"><path id="area" d="M12 12H145V85H12Z M40 35H60V55H40Z"/><path d="M5 18L150 74"/><path d="M5 20L150 76"/><path style="stroke-linecap:round;stroke-dashoffset:2;opacity:.7" d="M5 85L150 20"/><text x="16" y="106">Map Aa</text></svg>`);
 await page.addScriptTag({content:code});
 const result=await page.evaluate(dpr=>{
  const {captureCommands,paintCommands,createPaintState}=paintFixture,svg=document.getElementById('map'),canvases=[document.createElement('canvas'),document.createElement('canvas')],contexts=canvases.map(c=>c.getContext('2d'));
  const stamp=document.createElement('canvas');stamp.width=stamp.height=5;stamp.getContext('2d').fillRect(0,0,5,5);
  const signatures=[];let maxDifference=0,totalInk=0;
  for(const theme of ['light','dark'])for(const opacity of [1,.25])for(const scale of [1,.8]){
   document.body.className=theme==='dark'?'dark':'';
   const commands=[...svg.children].map(e=>captureCommands(e,svg,{world:true}));
   // Real resize resets all native state; a foreground-only redraw merely clears.
   if(scale===1)for(const c of canvases){c.width=160*dpr;c.height=120*dpr;}
   const m=new DOMMatrix([dpr*scale,0,0,dpr*scale,2*dpr,0]);
   for(const ctx of contexts){ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,160*dpr,120*dpr);}
   const state=createPaintState(contexts[1]);
   for(let i=0;i<commands.length;i++)for(let j=0;j<2;j++){
    const ctx=contexts[j];
    paintCommands(ctx,commands[i],m,{strokeFactor:1/scale,opacity,state:j?state:undefined});
    if(i===1){ctx.setTransform(dpr,0,0,dpr,0,0);ctx.globalAlpha=.35;ctx.drawImage(stamp,2,112);}
   }
   const [a,b]=contexts.map(c=>c.getImageData(0,0,160*dpr,120*dpr).data);let signature=0;
   for(let i=0;i<a.length;i++){maxDifference=Math.max(maxDifference,Math.abs(a[i]-b[i]));signature=(signature+a[i]*(i%97+1))>>>0;if(i%4===3&&a[i])totalInk++;}
   signatures.push(signature);
  }
  return {maxDifference,totalInk,distinct:new Set(signatures).size};
 },dpr);
 expect(result.maxDifference).toBe(0);expect(result.totalInk).toBeGreaterThan(1000);expect(result.distinct).toBe(8);
});
