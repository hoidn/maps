import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
test('Canvas land cover paints only the current theme and still honors its layer toggle',async({page})=>{
 const tile=color=>'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="${color}"/></svg>`);
 await page.setContent(`<style>.dark{display:none}[data-theme=dark] .light{display:none}[data-theme=dark] .dark{display:inline}</style><svg id="map" width="100" height="100" viewBox="0 0 100 100"><image class="landcover light" href="${tile('#00aa00')}" width="100" height="100"/><image class="landcover dark" href="${tile('#704000')}" width="100" height="100"/></svg><canvas width="100" height="100"></canvas>`);
 const bundle=(await build({stdin:{contents:"import {MapScene} from './pipeline/render/scene.js';window.MapScene=MapScene;",resolveDir:process.cwd()},bundle:true,write:false,format:'iife'})).outputFiles[0].text;await page.addScriptTag({content:bundle});
 const result=await page.evaluate(async()=>{
  const scene=new MapScene(document.getElementById('map'),{width:100,height:100});await scene.prepare();
  const ctx=document.querySelector('canvas').getContext('2d'),paint=enabled=>{ctx.clearRect(0,0,100,100);let count=0;for(const i of scene.images)if(scene.visible(i,{landcover:enabled},1)){ctx.drawImage(i.image,0,0,100,100);count++;}return {count,pixel:[...ctx.getImageData(50,50,1,1).data]};};
  const light=paint(true);document.documentElement.dataset.theme='dark';return {light,dark:paint(true),off:paint(false)};
 });
 expect(result.light).toEqual({count:1,pixel:[0,170,0,255]});expect(result.dark).toEqual({count:1,pixel:[112,64,0,255]});expect(result.off).toEqual({count:0,pixel:[0,0,0,0]});
});
