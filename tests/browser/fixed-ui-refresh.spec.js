import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {fixtureHTML} from '../support/browser-fixture.js';
let runtime;
test.beforeAll(async()=>{
 runtime=(await build({entryPoints:['pipeline/labels/browser.js'],bundle:true,loader:{'.txt':'text'},format:'iife',write:false})).outputFiles[0].text;
});
test('Canvas restores cartouche text after a hidden theme refresh and reset',async({page})=>{
 const html=(await fixtureHTML()).replace('id="mapsvg"','id="mapsvg" data-renderer="canvas"').replace('<defs>','<g class="fixed-ui"><g class="cartouche"><rect x="10" y="10" width="160" height="45" fill="white"/><text id="map-title" x="20" y="38" style="fill:rgb(255,0,0);stroke:none;font-size:22px">Map title</text></g></g><defs>');
 await page.setContent(html);await page.addScriptTag({content:runtime});
 const result=await page.evaluate(async()=>{
  const l=mapLayout;await l.ready;await l.whenSettled();const r=l.renderer,ui=l.svg.querySelector('.fixed-ui');
  const paintedTitle=()=>{const pixels=r.fg.getImageData(10,10,160,45).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>200&&pixels[i+1]<50&&pixels[i+2]<50&&pixels[i+3]>200)count++;return count;};
  const before=paintedTitle();ui.style.display='none';l.requestView({x:50,y:50,w:250,h:200});await l.whenSettled();
  document.documentElement.dataset.theme='dark';await r.refresh();await l.whenSettled();
  ui.style.display='';l.requestView({x:0,y:0,w:500,h:400});await l.whenSettled();
  const title=r.scene.items.find(item=>item.element.id==='map-title');
  return {before,after:paintedTitle(),commands:title.commands.length,visible:r.scene.visible(title,l.layers,1,l.view)};
 });
 expect(result.before).toBeGreaterThan(20);expect(result.commands).toBeGreaterThan(0);
 expect(result.visible).toBe(true);expect(result.after).toBeGreaterThan(20);
});
