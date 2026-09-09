import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const candidate=path.resolve('pipeline/grand_canyon_trails_interactive.html');
// These real-artifact sweeps await completed labels at up to14zoom states.
// Camera responsiveness has separate per-frame tests and timing limits.
test.setTimeout(240000);
// Real trail bends are essential: a blank map cannot reproduce these omissions.
test('campground marker survives zooms and names retain coverage except for protected geometry',async({page})=>{
 test.skip(!fs.existsSync(candidate),'Build cached map candidates first');
 await page.setViewportSize({width:1280,height:900});
 await page.goto('file://'+candidate+'?renderer=svg');
 const failures=await page.evaluate(async()=>{
  await mapLayout.ready;await mapLayout.whenSettled();
  const f=mapLayout.manifest.features.find(f=>f.name==='Horseshoe Mesa CG'),source=mapLayout.manifest.features.find(f=>f.sourceId==='osm:node:5476147596'),out=[];
  // The reviewed OSM camp and authored camp are0.14map units apart. Either
  // representation may win collisions; requiring both would demand overlap.
  if(!source||Math.hypot(source.anchor[0]-f.anchor[0],source.anchor[1]-f.anchor[1])>.25)throw Error('Camp source identity/location changed; review the coverage fixture');
  const featureIds=new Set([f.id,source.id]),protectedPaths=[...mapLayout.svg.querySelectorAll('[data-layout-obstacle="trail"]')].map(e=>e.id);
  let namedViews=0;
  for(const z of [1,2,2.5,2.75,3,3.25,3.5,3.75,4.5,8,14,8,3,1]){
   const w=1300/z,h=1070/z;
   mapLayout.requestView({x:Math.max(0,Math.min(1300-w,f.anchor[0]-w/2)),y:Math.max(0,Math.min(1070-h,f.anchor[1]-h/2)),w,h});await mapLayout.whenSettled();
   for(const kind of ['symbol','point-label']){
    const annotations=mapLayout.manifest.annotations.filter(a=>featureIds.has(a.featureId)&&a.kind===kind);
    const visible=annotations.some(a=>{const e=document.getElementById(a.id),o=mapLayout.result.outcomes.find(o=>o.id===a.id);return o.reason==='placed'&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility==='visible'});
    if(kind==='point-label'&&visible)namedViews++;
    if(!visible){
     const outcomes=annotations.map(a=>mapLayout.result.outcomes.find(o=>o.id===a.id));
     // Large legible text cannot fit every trail pinch point within 32 px.
     // Only explicit protected-geometry rejection is allowed here: no budget,
     // stale state, competing-label suppression or zoom-specific exception.
     const geometricOmission=kind==='point-label'&&outcomes.length&&outcomes.every(o=>o.reason==='no-valid-candidate'&&o.blockerIds.length&&o.blockerIds.every(id=>protectedPaths.some(path=>id.startsWith(path+':'))));
     if(!geometricOmission)out.push({z,kind,outcomes});
    }
   }
  }
  if(namedViews<12)out.push({namedViews,minimum:12});
  return out;
 });expect(failures).toEqual([]);
});

test('river polygons widen geographically and follow water and theme controls',async({page})=>{
 test.skip(!fs.existsSync(candidate),'Build cached map candidates first');
 await page.goto('file://'+candidate+'?renderer=svg');
 const result=await page.evaluate(async()=>{
  await mapLayout.ready;await mapLayout.whenSettled();
  const e=document.querySelector('.area-waterbody');if(!e)return {missing:true};
  // Firefox's client box includes the constant-width painted outline. A tiny
  // polygon therefore has a non-geographic client-box ratio. Project its fill
  // geometry instead, and check the outline's pixel width separately below.
  const fillHeight=()=>e.getBBox().height*Math.hypot(e.getScreenCTM().c,e.getScreenCTM().d);
  const baseHeight=fillHeight(),d=e.getAttribute('d'),light=getComputedStyle(e).fill;
  const f=mapLayout.manifest.features.find(f=>f.name==='Bright Angel CG'),w=1300/8,h=1070/8;
  mapLayout.requestView({x:f.anchor[0]-w/2,y:f.anchor[1]-h/2,w,h});await mapLayout.whenSettled();
  const ratio=fillHeight()/baseHeight;
  document.documentElement.dataset.theme='dark';
  const dark=getComputedStyle(e).fill,strokePixels=parseFloat(getComputedStyle(e).strokeWidth)*Math.hypot(e.getScreenCTM().a,e.getScreenCTM().b);
  mapLayout.setLayer('water',false);await mapLayout.whenSettled();
  return {missing:false,ratio,strokePixels,sameGeometry:d===e.getAttribute('d'),light,dark,hidden:getComputedStyle(e.parentElement).display==='none',stroke:getComputedStyle(e).stroke};
 });
 expect(result.missing).toBe(false);expect(result.ratio).toBeCloseTo(8,3);expect(result.sameGeometry).toBe(true);
 expect(result.light).not.toBe(result.dark);expect(result.hidden).toBe(true);expect(result.stroke).not.toBe('none');expect(result.strokePixels).toBeLessThanOrEqual(1);
});

test('place names return close to their anchors instead of retaining distant positions',async({page})=>{
 test.skip(!fs.existsSync(candidate),'Build cached map candidates first');
 await page.goto('file://'+candidate+'?renderer=svg');
 const samples=await page.evaluate(async()=>{
  await mapLayout.ready;await mapLayout.whenSettled();
  const f=mapLayout.manifest.features.find(f=>f.name==='Havasupai Gardens'),a=mapLayout.manifest.annotations.find(a=>a.featureId===f.id&&a.kind==='point-label'),out=[];
  for(const z of [2,3,4.5,8,14,8,3,2]){
   const w=1300/z,h=1070/z;mapLayout.requestView({x:f.anchor[0]-w/2,y:f.anchor[1]-h/2,w,h});await mapLayout.whenSettled();
   const e=document.getElementById(a.id),r=e.getBoundingClientRect(),p=new DOMPoint(...f.anchor).matrixTransform(mapLayout.svg.getScreenCTM());
   out.push({z,visible:getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility==='visible',gap:Math.hypot(Math.max(r.left-p.x,0,p.x-r.right),Math.max(r.top-p.y,0,p.y-r.bottom))});
  }return out;
 });
 for(const s of samples){expect(s.visible,JSON.stringify(s)).toBe(true);expect(s.gap,JSON.stringify(s)).toBeLessThanOrEqual(16);}
});
