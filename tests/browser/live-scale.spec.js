import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {mountFixture} from '../support/browser-fixture.js';
test('live metric and imperial scale match zoom and responsive width',async({page})=>{
 await mountFixture(page);
 await page.evaluate(()=>{const Native=window.ResizeObserver;window.insideScaleResize=false;window.scaleResizeWrites=0;window.ResizeObserver=class extends Native{constructor(callback){super((...args)=>{window.insideScaleResize=true;try{callback(...args)}finally{window.insideScaleResize=false}})}};const inner=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');Object.defineProperty(Element.prototype,'innerHTML',{...inner,set(value){if(window.insideScaleResize&&this.classList?.contains('live-scale'))window.scaleResizeWrites++;return inner.set.call(this,value)}})});
 await page.evaluate(()=>{const l=mapLayout;l.manifest.map.frame={bbox:[-1,0,1,2]};l.manifest.map.metersPerMapUnit=30;for(const id of ['zin','zout','zreset','goto','zlabel','readout','ttip']){const e=document.createElement('div');e.id=id;l.svg.parentElement.append(e)}});
 let script=await fs.readFile('pipeline/cartography/interactive.js','utf8');for(const [key,value] of Object.entries({PROFILE_JSON:'{}',DEM_GW:'1',DEM_GH:'1',DEM_B64:'AAA=',DEM_LON0:'-1',DEM_LON1:'1',DEM_LAT0:'0',DEM_LAT1:'2'}))script=script.replaceAll(key,value);
 await page.addScriptTag({content:script});
 for(const [width,zoom] of [[500,1],[500,8],[320,8],[320,2]]){
  await page.evaluate(async({width,zoom})=>{document.querySelector('.map-wrap').style.width=width+'px';mapLayout.requestView({x:0,y:0,w:500/zoom,h:400/zoom});await mapLayout.whenSettled();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))},{width,zoom});
  const result=await page.evaluate(()=>{const l=mapLayout,v=l.view,lat=2-(v.y+v.h/2)/400*2,mpp=30*Math.cos(lat*Math.PI/180)/Math.cos(Math.PI/180)*v.w/l.svg.clientWidth;return [...document.querySelectorAll('.live-scale span')].map(e=>{const [n,unit]=e.textContent.split(' ');return{pixels:parseFloat(e.style.width),meters:Number(n)*({m:1,km:1000,ft:.3048,mi:1609.344}[unit]),mpp}})});
  expect(await page.evaluate(()=>window.scaleResizeWrites)).toBe(0);
  expect(result).toHaveLength(2);for(const r of result){expect(r.pixels).toBeGreaterThan(0);expect(r.pixels).toBeLessThanOrEqual(110);expect(Math.abs(r.pixels*r.mpp-r.meters)).toBeLessThanOrEqual(r.mpp*.51)}
 }
});
