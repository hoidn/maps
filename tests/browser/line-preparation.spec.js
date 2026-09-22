import {test,expect} from '@playwright/test';
import {fixtureHTML} from '../support/browser-fixture.js';
import fs from 'node:fs/promises';

for(const mode of ['interactive','static'])for(const shape of ['straight','curved'])test(`${mode} short ${shape} lines batch setup before native geometry reads`,async({page})=>{
 await page.setContent((await fixtureHTML(mode)).replace('M20,250 Q200,100 470,250','M200,200 L200.1,200'));
 await page.evaluate(shape=>{
  const source=document.getElementById('map-label-manifest'),manifest=JSON.parse(source.textContent),base=manifest.annotations.find(a=>a.id==='curve'),original=document.getElementById('curve');
  if(shape==='straight'){delete base.geometryId;base.geometryIds=['waterpath'];original.querySelector('text').textContent='River';}
  for(let i=0;i<80;i++){
   const id='short-line-'+i,element=original.cloneNode(true);element.id=id;element.dataset.layoutId=id;original.after(element);
   manifest.annotations.push({...base,id,elementId:id,anchor:[200,200]});
  }
  source.textContent=JSON.stringify(manifest);
 },shape);
 await page.addScriptTag({content:await fs.readFile('pipeline/labels/dist/browser.js','utf8')});
 await page.evaluate(async()=>{await mapLayout.ready;await mapLayout.whenSettled();});
 const result=await page.evaluate(async()=>{
  const observer=new MutationObserver(()=>{});observer.observe(mapLayout.svg,{subtree:true,attributes:true,attributeOldValue:true,childList:true,characterData:true});
  let barriers=0;const native=SVGGraphicsElement.prototype.getScreenCTM;
  SVGGraphicsElement.prototype.getScreenCTM=function(...args){
   if(observer.takeRecords().some(r=>r.type!=='attributes'||r.oldValue!==r.target.getAttribute(r.attributeName)))barriers++;
   return native.apply(this,args);
  };
  try{
   mapLayout.requestView({x:0,y:0,w:250,h:200});await mapLayout.whenSettled();
   return {barriers,lines:[...mapLayout.lineCache.values()].length,candidates:[...mapLayout.lineCache.values()].reduce((n,e)=>n+e.candidates.length,0),invalid:mapLayout.prepared.filter(a=>a.eligibleReason==='invalid-metrics').length,clones:mapLayout.svg.querySelectorAll('[data-layout-measurement]').length};
  }finally{SVGGraphicsElement.prototype.getScreenCTM=native;observer.disconnect();}
 });
 expect(result.lines).toBe(81);expect(result.candidates).toBe(0);expect(result.invalid).toBe(0);expect(result.clones).toBe(0);
 // Curved names still require their real straight fallback and restoration.
 expect(result.barriers).toBeLessThan((shape==='curved'?2*81:0)+24);
});
