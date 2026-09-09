import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import {fixtureHTML} from '../support/browser-fixture.js';
import {collectTypography,checkTypography} from '../support/typography-audit.js';
for(const backend of ['svg','canvas','webgl'])test(`${backend} settlement hierarchy survives zoom and preference changes without abbreviating names`,async({page})=>{
 const css=await fs.readFile('pipeline/cartography/styles.css','utf8');
 await page.setContent((await fixtureHTML()).replace('id="mapsvg"',`id="mapsvg" data-renderer="${backend}"`)+`<style>${css}</style>`);
 await page.evaluate(()=>{
  const source=document.getElementById('map-label-manifest'),manifest=JSON.parse(source.textContent),svg=document.getElementById('mapsvg');
  svg.querySelector('.labels').replaceChildren();svg.querySelector('.hydro-labels').remove();manifest.features=[];manifest.annotations=[];
  for(const [id,text,style,y,kind] of [['settlement','Grand Canyon Village','l-settlement',30,'point-label'],['local','Boulder Alley','l-road',100,'line-label'],['major','Regional Highway','l-road-major',145,'line-label'],['trail','Walking Route','l-trail',180,'line-label']]){
   const anchor=[id==='settlement'?20:105,y],geometryId=kind==='line-label'?'path-'+id:null;
   manifest.features.push({id:'f-'+id,name:text,anchor,directory:false});manifest.annotations.push({id,elementId:id,featureId:'f-'+id,kind,layer:kind==='line-label'?'names':'places',anchor,text,style,priority:id==='settlement'?850:750,geometryId,requiredProfiles:[]});
   if(geometryId)svg.querySelector('defs').insertAdjacentHTML('beforeend',`<path id="${geometryId}" d="M10,${y} L240,${y}"/>`);
   svg.querySelector('.labels').insertAdjacentHTML('beforeend',`<g id="${id}" data-layout-id="${id}" data-feature-id="f-${id}">${geometryId?`<text class="${style}" dy="-4"><textPath href="#${geometryId}" startOffset="50%" text-anchor="middle">${text}</textPath></text>`:`<text class="${style}" style="transform:translate(20px,30px) scale(var(--k)) translate(7px,4px)">${text}</text>`}</g>`);
  }
  source.textContent=JSON.stringify(manifest);
 });
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});await page.evaluate(()=>mapLayout.whenSettled());
 const sizes=async()=>{
  const data=await page.evaluate(collectTypography),policy=await page.evaluate(()=>mapLayout.policy);
  expect(checkTypography(data,policy)).toEqual([]);
  return Object.fromEntries(data.items.map(a=>[a.id,Math.max(...a.fonts.filter(f=>!f.secondary).map(f=>f.size))]));
 };
 const base=await sizes();expect(base.settlement).toBeCloseTo(18,1);expect(base.local).toBeCloseTo(12,1);expect(base.major).toBeCloseTo(14,1);expect(base.trail).toBeCloseTo(14,1);expect(base.settlement/base.local).toBeGreaterThan(1.45);
 await page.evaluate(async()=>{mapLayout.requestView({x:0,y:0,w:250,h:200});await mapLayout.whenSettled();});const zoom=await sizes();
 for(const id of Object.keys(base))expect(zoom[id]).toBeGreaterThan(base[id]);
 await page.evaluate(async()=>{mapLayout.setTextScale(1.5);await mapLayout.whenSettled();});const large=await sizes();
 for(const id of Object.keys(base))expect(large[id]/zoom[id]).toBeCloseTo(1.5,2);
 const names=await page.evaluate(()=>Object.fromEntries(mapLayout.result.placements.map(p=>[p.id,mapLayout.elements.get(p.id).textContent.replace(/\s+/g,' ').trim()])));
 expect(names).toEqual({settlement:'Grand Canyon Village',local:'Boulder Alley',major:'Regional Highway',trail:'Walking Route'});
});
