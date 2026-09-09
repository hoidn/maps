import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const candidate=path.resolve('pipeline/grand_canyon_trails_interactive.html');
// Real trail bends are essential: a blank map cannot reproduce these omissions.
test('campground name and anchored marker survive intermediate zooms in both directions',async({page})=>{
 test.skip(!fs.existsSync(candidate),'Build cached map candidates first');
 await page.setViewportSize({width:1280,height:900});
 await page.goto('file://'+candidate);
 const failures=await page.evaluate(async()=>{
  await mapLayout.ready;await mapLayout.whenSettled();
  const f=mapLayout.manifest.features.find(f=>f.name==='Horseshoe Mesa CG'),out=[];
  for(const z of [1,2,2.5,2.75,3,3.25,3.5,3.75,4.5,8,14,8,3,1]){
   const w=1300/z,h=1070/z;
   mapLayout.requestView({x:Math.max(0,Math.min(1300-w,f.anchor[0]-w/2)),y:Math.max(0,Math.min(1070-h,f.anchor[1]-h/2)),w,h});await mapLayout.whenSettled();
   for(const a of mapLayout.manifest.annotations.filter(a=>a.featureId===f.id)){
    const e=document.getElementById(a.id),o=mapLayout.result.outcomes.find(o=>o.id===a.id);
    if(o.reason!=='placed'||getComputedStyle(e).display==='none'||getComputedStyle(e).visibility!=='visible')out.push({z,kind:a.kind,reason:o.reason});
   }
  }return out;
 });expect(failures).toEqual([]);
});

test('river polygons widen geographically and follow water and theme controls',async({page})=>{
 test.skip(!fs.existsSync(candidate),'Build cached map candidates first');
 await page.goto('file://'+candidate);
 const result=await page.evaluate(async()=>{
  await mapLayout.ready;await mapLayout.whenSettled();
  const e=document.querySelector('.river-area');if(!e)return {missing:true};
  const base=e.getBoundingClientRect(),d=e.getAttribute('d'),light=getComputedStyle(e).fill;
  const f=mapLayout.manifest.features.find(f=>f.name==='Bright Angel CG'),w=1300/8,h=1070/8;
  mapLayout.requestView({x:f.anchor[0]-w/2,y:f.anchor[1]-h/2,w,h});await mapLayout.whenSettled();
  const ratio=e.getBoundingClientRect().height/base.height;
  document.documentElement.dataset.theme='dark';
  const dark=getComputedStyle(e).fill;
  mapLayout.setLayer('water',false);await mapLayout.whenSettled();
  return {missing:false,ratio,sameGeometry:d===e.getAttribute('d'),light,dark,hidden:getComputedStyle(e.parentElement).display==='none',stroke:getComputedStyle(e).stroke};
 });
 expect(result.missing).toBe(false);expect(result.ratio).toBeCloseTo(8,3);expect(result.sameGeometry).toBe(true);
 expect(result.light).not.toBe(result.dark);expect(result.hidden).toBe(true);expect(result.stroke).toBe('none');
});
