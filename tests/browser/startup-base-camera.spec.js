import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {fixtureHTML} from '../support/browser-fixture.js';
async function mountHeldPlacement(page,backend,{cooperativeProbe=false}={}){
 const html=(await fixtureHTML()).replace('id="mapsvg"',`id="mapsvg" data-renderer="${backend}"`).replace('<defs>','<g class="regions"><rect x="350" y="280" width="80" height="70" fill="rgb(230,120,70)"/></g><defs>');
 await page.setContent(html);
 await page.evaluate(cooperativeProbe=>{
  const send=Worker.prototype.postMessage;window.holdPlacement=true;window.heldPlacements=[];
  Worker.prototype.postMessage=function(message,...rest){
   if(holdPlacement&&message.kind==='solve-initial'){heldPlacements.push(()=>send.call(this,message,...rest));return;}
   return send.call(this,message,...rest);
  };
  if(cooperativeProbe){
   const now=performance.now.bind(performance),query=Element.prototype.querySelector;let offset=0,scheduled=false;
   performance.now=()=>now()+offset;
   Element.prototype.querySelector=function(selector){
    const value=query.call(this,selector);
    if(window.mapLayout?.starting&&selector==='text'&&this.matches('[data-layout-id],[data-layout-measurement]')){
     offset+=20;
     if(!scheduled){scheduled=true;setTimeout(()=>{window.preparationYield={workerMessages:heldPlacements.length,measurementNodes:mapLayout.svg.querySelectorAll('[data-layout-measurement]').length};Element.prototype.querySelector=query;},0);}
    }
    return value;
   };
  }
 },cooperativeProbe);
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.waitForFunction(()=>mapLayout.renderer&&heldPlacements.length>0);
 await page.evaluate(async()=>{await mapLayout.renderer.ready;window.initialReady=false;mapLayout.ready.then(()=>{initialReady=true;});window.idleReady=false;mapLayout.whenSettled().then(()=>{idleReady=true;});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
}
for(const backend of ['canvas','webgl'])test(`${backend} paints complete base and current cameras before delayed initial labels`,async({page})=>{
 await mountHeldPlacement(page,backend);
 expect(await page.evaluate(()=>mapLayout.renderer.active)).toBe(true);
 const initial=await page.evaluate(()=>({ready:initialReady,idle:idleReady,painted:mapLayout.renderer.painted.length,status:mapLayout.status}));
 expect(initial).toEqual({ready:false,idle:false,painted:0,status:'loading'});
 for(const view of [{x:50,y:40,w:400,h:320},{x:60,y:40,w:400,h:320}]){
  const state=await page.evaluate(async view=>{
   const l=mapLayout;l.requestView(view);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
   const r=l.renderer,v=r.paintedView;
   return {view:v,revision:r.paintedRevision,currentRevision:l.revision,labels:r.painted.length,ready:initialReady,
    pixel:[...r.fg.getImageData((390-v.x)*r.foreground.width/v.w,(310-v.y)*r.foreground.height/v.h,1,1).data]};
  },view);
  expect(state.view).toEqual(view);expect(state.revision).toBe(state.currentRevision);expect(state.labels).toBe(0);expect(state.ready).toBe(false);expect(state.pixel).toEqual([230,120,70,255]);
 }
 await page.evaluate(async()=>{holdPlacement=false;for(const send of heldPlacements.splice(0))send();await mapLayout.ready;await mapLayout.whenSettled();});
 const final=await page.evaluate(()=>({ready:initialReady,idle:idleReady,status:mapLayout.status,visible:mapLayout.visibleIds.size,painted:mapLayout.renderer.painted.length,view:mapLayout.renderer.paintedView,current:mapLayout.view,measurements:mapLayout.svg.querySelectorAll('[data-layout-measurement]').length}));
 expect(final.ready).toBe(true);expect(final.idle).toBe(true);expect(final.status).toBe('ready');expect(final.visible).toBeGreaterThanOrEqual(2);expect(final.painted).toBe(final.visible);expect(final.view).toEqual(final.current);expect(final.measurements).toBe(0);
});

test('initial measurement yields with private nodes before dispatching the placement worker',async({page})=>{
 await mountHeldPlacement(page,'canvas',{cooperativeProbe:true});
 const state=await page.evaluate(()=>preparationYield);
 expect(state.workerMessages).toBe(0);expect(state.measurementNodes).toBeGreaterThan(0);
 await page.evaluate(async()=>{holdPlacement=false;for(const send of heldPlacements.splice(0))send();await mapLayout.whenSettled();});
 expect(await page.evaluate(()=>mapLayout.svg.querySelectorAll('[data-layout-measurement]').length)).toBe(0);
});

test('early input retains every source background while scene image decoding is pending',async({page})=>{
 const source=(await fixtureHTML()).replace('id="mapsvg"','id="mapsvg" data-renderer="canvas"');
 const png='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="red"/></svg>');
 const html=source.replace('<defs>',`<image class="terrain" width="500" height="400" href="${png}"/><rect id="source-background" class="regions" data-layout-background="" x="340" y="260" width="100" height="100" fill="rgb(80,120,210)"/><defs>`);
 await page.setContent(html);
 await page.evaluate(()=>{
  const decode=HTMLImageElement.prototype.decode;window.holdScene=true;window.sceneDecodes=[];
  HTMLImageElement.prototype.decode=async function(){await decode.call(this);if(holdScene&&this.src.startsWith('data:'))await new Promise(resolve=>sceneDecodes.push(resolve));};
 });
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.waitForFunction(()=>sceneDecodes.length>0);
 await page.evaluate(async()=>{await mapLayout.preview.ready;mapLayout.requestView({x:20,y:10,w:450,h:360});await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);});
 expect(await page.evaluate(()=>!!document.getElementById('source-background')?.isConnected)).toBe(true);
 expect(await page.evaluate(()=>mapLayout.preview.active)).toBe(false);
 await page.evaluate(async()=>{holdScene=false;sceneDecodes.splice(0).forEach(resolve=>resolve());await mapLayout.whenSettled();});
 const state=await page.evaluate(()=>{const l=mapLayout,r=l.renderer,v=r.paintedView;return {captured:r.scene.items.some(item=>item.element.id==='source-background'),pixel:[...r.fg.getImageData((390-v.x)*r.foreground.width/v.w,(310-v.y)*r.foreground.height/v.h,1,1).data]};});
 expect(state.captured).toBe(true);expect(state.pixel).toEqual([80,120,210,255]);
});

test('a preparation error before private nodes exist retains its original diagnostic',async({page})=>{
 const html=(await fixtureHTML()).replace('<defs>','<path data-layout-obstacle="trail" d="M0,0 C1,1 2,2 3,3"/><defs>');
 await page.setContent(html);await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 const state=await page.evaluate(async()=>{await mapLayout.ready.catch(()=>{});return {status:mapLayout.status,error:mapLayout.error};});
 expect(state.status).toBe('error');expect(state.error).toBe('Protected trail must be an absolute polyline');
});
