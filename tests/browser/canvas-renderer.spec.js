import {test,expect} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import fs from 'node:fs/promises';
async function mount(page){
 let html=(await fixtureHTML()).replace('id="mapsvg"','id="mapsvg" data-renderer="canvas"');
 html=html.replace('<defs>','<g class="trails"><path id="trail" class="tr" data-name="Fixture Trail" fill="none" stroke="red" stroke-width="2" d="M20,300 L480,300"/></g><g class="hits"><path class="hit" data-name="Fixture Trail" d="M20,300 L480,300" fill="none" stroke="transparent" stroke-width="14"/></g><defs>');
 await page.setContent(html);await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();});
}

test('Canvas paints map geometry and accepted labels with SVG retained only for measurement',async({page})=>{
 await mount(page);
 const data=await page.evaluate(()=>({active:mapLayout.renderer?.active,backend:mapLayout.renderer?.backend,opacity:mapLayout.svg.style.opacity,painted:mapLayout.renderer?.painted?.length}));
 expect(data.active).toBe(true);expect(data.backend).toBe('canvas');expect(data.opacity).toBe('0');expect(data.painted).toBeGreaterThan(0);
});

test('Canvas pan frames do not read SVG geometry or write its viewBox',async({page})=>{
 await mount(page);
 const data=await page.evaluate(async()=>{const l=mapLayout;let reads=0,writes=0;const get=l.svg.getScreenCTM.bind(l.svg),set=l.svg.setAttribute.bind(l.svg);l.svg.getScreenCTM=()=>{reads++;return get();};l.svg.setAttribute=(name,...args)=>{if(name==='viewBox')writes++;return set(name,...args);};l.beginGesture('pointer');for(let i=0;i<4;i++){l.requestView({...l.view,x:l.view.x+1});await new Promise(requestAnimationFrame);}const result={reads,writes};l.endGesture('pointer');await l.whenSettled();return result;});
 expect(data).toEqual({reads:0,writes:0});
});

test('Canvas trail picking preserves feature identity',async({page})=>{
 await mount(page);
 const name=await page.evaluate(()=>{const m=mapLayout.svg.getScreenCTM();return mapLayout.pickTrail?.(m.a*200+m.e,m.d*300+m.f)?.dataset.name;});
 expect(name).toBe('Fixture Trail');
});

test('Canvas zoom frames leave measurement SVG transforms unchanged',async({page})=>{
 await mount(page);
 const data=await page.evaluate(async()=>{const l=mapLayout,before=[...l.elements.values()].map(e=>e.getAttribute('transform'));l.beginGesture('pointer');l.requestView({...l.view,w:300,h:240});await new Promise(requestAnimationFrame);const after=[...l.elements.values()].map(e=>e.getAttribute('transform'));l.endGesture('pointer');await l.whenSettled();return {before,after};});
 expect(data.after).toEqual(data.before);
});

test('independent audit reads Canvas paint rather than hidden SVG or solver boxes',async({page})=>{
 const {collectManagedInventory,checkManagedInventory}=await import('../support/managed-map-adapter.js');
 await mount(page);
 const data=await page.evaluate(collectManagedInventory);
 expect(data.visible.length).toBeGreaterThan(0);expect(checkManagedInventory(data).clipped).toEqual([]);
 await page.evaluate(()=>{mapLayout.renderer.painted[0].offset[0]-=1000;});
 const corrupted=await page.evaluate(collectManagedInventory);
 expect(checkManagedInventory(corrupted).clipped.length).toBeGreaterThan(0);
});

test('Canvas clears label paint when a required font becomes unavailable',async({page})=>{
 await mount(page);
 await page.evaluate(async()=>{
  for(const style of document.querySelectorAll('style'))style.textContent=style.textContent.replace(/@font-face\s*\{[^}]*\}/g,rule=>rule.includes('Source Sans 3')?'':rule);
  const broken=document.createElement('style');broken.textContent='@font-face {font-family:"Source Sans 3";src:url(data:font/ttf;base64,AAAA)}';document.head.append(broken);
  try{await document.fonts.load('12px "Source Sans 3"');}catch{}
 });
 await expect.poll(()=>page.evaluate(()=>mapLayout.status)).toBe('error');
 expect(await page.evaluate(()=>mapLayout.renderer.painted.length)).toBe(0);
});

test('Canvas picks the topmost overlapping trail and does not bake hover dimming into a refreshed scene',async({page})=>{
 await mount(page);
 const result=await page.evaluate(async()=>{const l=mapLayout,r=l.renderer,p=document.querySelector('.hits path'),top=p.cloneNode(true);top.dataset.name='Topmost';p.after(top);
 const style=document.createElement('style');style.textContent='.tr.dim{opacity:.25}';document.head.append(style);document.getElementById('trail').classList.add('dim');
 await r.refresh();await l.whenSettled();const m=l.svg.getScreenCTM();return {name:r.pickTrail(m.a*200+m.e,m.d*300+m.f)?.dataset.name,opacity:r.scene.items.find(i=>i.name==='Fixture Trail').commands[0].style.opacity};});
 expect(result).toEqual({name:'Topmost',opacity:1});
});

test('unsupported transformed contours fall back to painted SVG',async({page})=>{
 let html=(await fixtureHTML()).replace('id="mapsvg"','id="mapsvg" data-renderer="canvas"').replace('<defs>','<g class="contours" transform="translate(1)"><path fill="none" stroke="red" d="M10,20L40,50"/></g><defs>');
 await page.setContent(html);await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});await page.evaluate(()=>mapLayout.ready);
 expect(await page.evaluate(()=>({renderer:!!mapLayout.renderer,opacity:mapLayout.svg.style.opacity,error:mapLayout.rendererError}))).toEqual({renderer:false,opacity:'',error:'Unsupported Canvas contour group'});
});

test('Canvas typography audit measures painted font sizes and angles',async({page})=>{
 const {collectTypography,checkTypography}=await import('../support/typography-audit.js');await mount(page);
 const data=await page.evaluate(collectTypography);expect(data.items.length).toBeGreaterThan(0);expect(checkTypography(data)).toEqual([]);
 await page.evaluate(()=>{for(const c of mapLayout.renderer.painted.find(p=>p.commands.some(c=>c.kind==='glyph')).commands)if(c.kind==='glyph')c.style.fontSize=1;});
 expect(checkTypography(await page.evaluate(collectTypography)).some(e=>e.reason==='minimum-font-size')).toBe(true);
});

test('hover repaint stays aligned after page scrolling',async({page})=>{
 await mount(page);
 const alpha=await page.evaluate(()=>{document.body.style.minHeight='2400px';scrollTo(0,100);mapLayout.renderer.highlight('Fixture Trail');return mapLayout.renderer.fg.getImageData(200,300,1,1).data[3];});
 expect(alpha).toBeGreaterThan(0);
});

test('held pan reuses the same label sprites and text layout',async({page})=>{
 await mount(page);
 const data=await page.evaluate(async()=>{const l=mapLayout,r=l.renderer,before=new Map([...r.labels].map(([id,v])=>[id,v.sprite]));l.beginGesture('pointer');for(let i=0;i<3;i++){l.requestView({...l.view,x:l.view.x+1});await new Promise(requestAnimationFrame);}const result={count:r.painted.length,reused:r.painted.every(p=>p.sprite===before.get(p.id))};l.endGesture('pointer');await l.whenSettled();return result;});
 expect(data.count).toBeGreaterThan(0);expect(data.reused).toBe(true);
});

test('renderer disposal cannot reactivate stale surfaces on a later commit',async({page})=>{
 await mount(page);
 const data=await page.evaluate(async()=>{const l=mapLayout,r=l.renderer;dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));const retained=r.active;r.destroy();l.invalidateLayout();l.schedule();await l.whenSettled();return {retained,renderer:!!l.renderer,opacity:l.svg.style.opacity,canvases:document.querySelectorAll('[data-map-canvas]').length,status:l.status};});
 expect(data).toEqual({retained:true,renderer:false,opacity:'',canvases:0,status:'ready'});
});

test('offscreen paths do not reach Canvas stroke calls during deep pans',async({page})=>{
 await mount(page);
 const strokes=await page.evaluate(async()=>{const l=mapLayout,r=l.renderer;l.requestView({x:300,y:10,w:100,h:80});await l.whenSettled();const path=r.scene.items.find(i=>i.name==='Fixture Trail').commands[0].path,stroke=r.fg.stroke.bind(r.fg);let count=0;r.fg.stroke=(p,...args)=>{if(p===path)count++;return stroke(p,...args);};l.beginGesture('pointer');l.requestView({...l.view,x:301});await new Promise(requestAnimationFrame);l.endGesture('pointer');return count;});
 expect(strokes).toBe(0);
});
