import {test,expect} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import fs from 'node:fs/promises';

test('contour elevation text keeps its live path reference throughout panning',async({page})=>{
 const html=(await fixtureHTML())
  .replace('<defs><path id="waterpath" d="M20,250 Q200,100 470,250"/></defs>','<g class="contours"><path id="waterpath" fill="none" stroke="black" d="M20,250 L470,250"/></g>')
  .replaceAll('l-river','l-contour').replaceAll('River','8,500').replaceAll('hydro-labels','contour-labels');
 await page.setContent(html);
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();});
 const result=await page.evaluate(async()=>{
  const l=mapLayout;await l.render(true); // Capture the source parent after any initial resize preview.
  const path=document.getElementById('waterpath'),parent=path.parentNode;
  const read=()=>({visible:l.visibleIds.has('curve'),width:document.querySelector('#curve text').getBBox().width,pathConnected:path.isConnected,pathCount:document.querySelectorAll('#waterpath').length});
  const before=read(),frames=[];
  for(let i=0;i<3;i++){l.view={...l.view,x:l.view.x+1};l.render(false);frames.push({...read(),active:l.preview.active});}
  await l.render(true);
  return {before,frames,after:read(),restored:path.parentNode===parent,extraSources:document.querySelectorAll('[data-layout-preview-sources]').length};
 });
 expect(result.before.visible).toBe(true);expect(result.before.width).toBeGreaterThan(0);
 for(const frame of result.frames){expect(frame.active).toBe(true);expect(frame.visible).toBe(true);expect(frame.pathConnected).toBe(true);expect(frame.pathCount).toBe(1);expect(frame.width).toBeCloseTo(result.before.width,3);}
 expect(result.restored).toBe(true);expect(result.extraSources).toBe(0);expect(result.after.width).toBeCloseTo(result.before.width,3);
});

test('a cached elevation label hidden before dragging regains its live source when panned back',async({page})=>{
 const html=(await fixtureHTML()).replace('<defs><path id="waterpath" d="M20,250 Q200,100 470,250"/></defs>','<g class="contours"><path id="waterpath" fill="none" stroke="black" d="M20,250 L470,250"/></g>').replaceAll('l-river','l-contour');
 await page.setContent(html);await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});await page.evaluate(()=>mapLayout.ready);
 const result=await page.evaluate(async()=>{const l=mapLayout;await l.render(true);const view={...l.view};l.view={...view,x:600};await l.render(true);const hidden=!l.visibleIds.has('curve');l.view=view;l.render(false);return {hidden,visible:l.visibleIds.has('curve'),source:!!document.getElementById('waterpath'),width:document.querySelector('#curve text').getBBox().width};});
 expect(result.hidden).toBe(true);expect(result.visible).toBe(true);expect(result.source).toBe(true);expect(result.width).toBeGreaterThan(0);
});
