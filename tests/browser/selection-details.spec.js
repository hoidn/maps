import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {fixtureHTML} from '../support/browser-fixture.js';
import {selectPlace} from '../../scripts/fuzz-cartography.mjs';

let bundle,interaction;
test.beforeAll(async()=>{
 bundle=(await build({entryPoints:['pipeline/labels/browser.js'],bundle:true,write:false,format:'iife',loader:{'.txt':'text'}})).outputFiles[0].text;
 interaction=await readFile('pipeline/cartography/interactive.js','utf8');
 for(const [key,value] of Object.entries({PROFILE_JSON:'{}',DEM_GW:'1',DEM_GH:'1',DEM_B64:'AAA=',DEM_LON0:'-1',DEM_LON1:'1',DEM_LAT0:'0',DEM_LAT1:'2'}))interaction=interaction.replaceAll(key,value);
});

for(const backend of ['svg','canvas','webgl'])test(`${backend} directory details survive trail hover until explicit trail selection`,async({page})=>{
 const trail=hit=>`<path class="${hit?'hit':'tr'}" data-source-id="osm:trail" data-name="Stephens Ranch Spur Trail" data-cls="path" data-mi="0.7" d="M0,300L500,300" fill="none" stroke="${hit?'transparent':'red'}" stroke-width="${hit?14:2}"/>`;
 let html=(await fixtureHTML()).replace('id="mapsvg"',`id="mapsvg" data-renderer="${backend}"`).replace('<defs>',`<g class="trails">${trail(false)}</g><g class="hits">${trail(true)}</g><defs>`)
  .replace('>Controls</div>','><button id="zin">+</button><button id="zout">−</button><button id="zreset">⌂</button></div>')+'<select id="goto"></select><div id="readout"></div><div id="ttip" hidden></div><style>.hit{pointer-events:stroke}</style>';
 await page.setContent(html);
 await page.evaluate(()=>{const node=document.getElementById('map-label-manifest'),m=JSON.parse(node.textContent);m.features.push({id:'la-junta',sourceId:'osm:way:13320375',name:'La Junta Drive',anchor:[250,300],directory:true});node.textContent=JSON.stringify(m);});
 await page.addScriptTag({content:bundle});await page.addScriptTag({content:interaction});await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();});
 // The directory camera moves this trail under a stationary pointer. Native
 // SVG may deliver pointerover on that geometry change without a mouse move.
 await page.mouse.move(250,200);
 const selection={u:.99};await selectPlace(page,selection);
 expect(selection.selection).toMatchObject({selected:'la-junta',name:'La Junta Drive',details:'La Junta Drive'});
 await page.mouse.move(251,200);
 await expect(page.locator('[data-layout-details]')).toHaveText('La Junta Drive');
 expect(await page.evaluate(()=>mapLayout.selected)).toBe('la-junta');
 // A real click intentionally replaces directory details with pinned trail
 // details. Selecting the directory again also removes the old trail pin.
 if(backend==='svg')expect(await page.evaluate(()=>document.elementFromPoint(251,200)?.dataset.name)).toBe('Stephens Ranch Spur Trail');
 await page.mouse.click(251,200);
 await expect(page.locator('[data-layout-details]')).toContainText('Stephens Ranch Spur Trail');
 expect(await page.evaluate(()=>mapLayout.selected)).toBeNull();
 const highlighted=()=>{const l=mapLayout;return l.renderer?.active?[...(l.renderer.highlighted||[])]:[...l.svg.querySelectorAll('.tr.lit')].map(p=>p.dataset.sourceId);};
 expect(await page.evaluate(highlighted)).toEqual(['osm:trail']);
 await page.evaluate(async()=>{mapLayout.select('la-junta');await mapLayout.whenSettled();});
 expect(await page.evaluate(highlighted)).toEqual([]);
 await page.mouse.move(252,200);
 await expect(page.locator('[data-layout-details]')).toHaveText('La Junta Drive');
 if(backend==='svg'){
  await page.evaluate(()=>{const outside=document.createElement('div');outside.className='hit';outside.dataset.name='Unrelated map';outside.dataset.cls='path';outside.style.cssText='position:absolute;left:600px;top:100px;width:30px;height:30px';document.body.append(outside);mapLayout.svg.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:605,clientY:105}));});
  await expect(page.locator('[data-layout-details]')).toHaveText('La Junta Drive');
  expect(await page.evaluate(()=>mapLayout.selected)).toBe('la-junta');
 }
});
