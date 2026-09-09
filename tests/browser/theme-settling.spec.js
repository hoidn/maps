import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {fixtureHTML} from '../support/browser-fixture.js';

async function mount(page,backend){
 let html=(await fixtureHTML()).replace('id="mapsvg"',`id="mapsvg" data-renderer="${backend}"`);
 html=html.replace('</style>','.theme-ink{fill:rgb(230,220,210)}[data-theme="dark"] .theme-ink{fill:rgb(30,40,50)}</style>');
 // Every scene refresh must decode this resource before recording themed geometry.
 const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
 html=html.replace('<defs>',`<image href="${image}" width="1" height="1"/><g class="regions"><rect class="theme-ink" x="350" y="300" width="100" height="50"/></g><defs>`);
 await page.setContent(html);
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(async()=>{
  await mapLayout.whenSettled();
  const decode=HTMLImageElement.prototype.decode;
  window.decodes=[];
  HTMLImageElement.prototype.decode=async function(){
   await decode.call(this);
   await new Promise((resolve,reject)=>decodes.push({resolve,reject}));
  };
  window.pixel=()=>{const r=mapLayout.renderer,v=r.paintedView;return [...r.fg.getImageData((400-v.x)*r.foreground.width/v.w,(325-v.y)*r.foreground.height/v.h,1,1).data];};
  window.theme=async value=>{
   document.documentElement.dataset.theme=value;
   await Promise.resolve();await Promise.resolve();
  };
 });
}
for(const backend of ['canvas','webgl']){
 test(`${backend} whenSettled waits for delayed theme resources and their painted frame`,async({page})=>{
  await mount(page,backend);
  expect(await page.evaluate(()=>pixel())).toEqual([230,220,210,255]);
  await page.evaluate(async()=>{await theme('dark');window.settled=false;window.finished=mapLayout.whenSettled().then(()=>{settled=true;});});
  await expect.poll(()=>page.evaluate(()=>decodes.length)).toBe(1);
  expect(await page.evaluate(()=>settled)).toBe(false);
  await page.evaluate(async()=>{decodes[0].resolve();await finished;});
  expect(await page.evaluate(()=>pixel())).toEqual([30,40,50,255]);
  expect(await page.evaluate(()=>mapLayout.renderer.refreshPending)).toBe(0);
 });
 test(`${backend} rapid themes settle all refreshes without letting obsolete work replace the final theme`,async({page})=>{
  await mount(page,backend);
  await page.evaluate(()=>theme('dark'));
  await expect.poll(()=>page.evaluate(()=>decodes.length)).toBe(1);
  await page.evaluate(async()=>{await theme('light');window.settled=false;window.finished=mapLayout.whenSettled().then(()=>{settled=true;});});
  await expect.poll(()=>page.evaluate(()=>decodes.length)).toBe(2);
  await page.evaluate(()=>decodes[1].resolve());
  await expect.poll(()=>page.evaluate(()=>mapLayout.renderer.refreshPending)).toBe(1);
  expect(await page.evaluate(()=>settled)).toBe(false);
  await page.evaluate(async()=>{window.latestScene=mapLayout.renderer.scene;decodes[0].resolve();await finished;});
  expect(await page.evaluate(()=>mapLayout.renderer.scene===latestScene)).toBe(true);
  expect(await page.evaluate(()=>pixel())).toEqual([230,220,210,255]);
  expect(await page.evaluate(()=>mapLayout.renderer.refreshPending)).toBe(0);
 });
 test(`${backend} font invalidation and camera or layer changes do not cancel an in-flight theme scene`,async({page})=>{
  await mount(page,backend);
  await page.evaluate(()=>theme('dark'));
  await expect.poll(()=>page.evaluate(()=>decodes.length)).toBe(1);
  await page.evaluate(async()=>{
   mapLayout.fontsChanged();await mapLayout.fontReady;
   mapLayout.setLayer('water',false);
   mapLayout.requestView({x:0,y:0,w:450,h:360});
   window.finished=mapLayout.whenSettled();
   decodes[0].resolve();await finished;
  });
  expect(await page.evaluate(()=>pixel())).toEqual([30,40,50,255]);
  expect(await page.evaluate(()=>({status:mapLayout.status,water:mapLayout.layers.water,view:mapLayout.renderer.paintedView,pending:mapLayout.renderer.refreshPending}))).toEqual({status:'ready',water:false,view:{x:0,y:0,w:450,h:360},pending:0});
 });
 test(`${backend} failed theme resources fall back and release settled waiters`,async({page})=>{
  await mount(page,backend);
  await page.evaluate(async()=>{await theme('dark');window.oldRenderer=mapLayout.renderer;window.finished=mapLayout.whenSettled();});
  await expect.poll(()=>page.evaluate(()=>decodes.length)).toBe(1);
  await page.evaluate(async()=>{decodes[0].reject(new Error('Fixture resource failure'));await finished;});
  expect(await page.evaluate(()=>({renderer:!!mapLayout.renderer,pending:oldRenderer.refreshPending,fill:getComputedStyle(document.querySelector('.theme-ink')).fill,opacity:mapLayout.svg.style.opacity}))).toEqual({renderer:false,pending:0,fill:'rgb(30, 40, 50)',opacity:''});
 });
}
