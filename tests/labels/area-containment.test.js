import {pointCandidates} from '../../pipeline/labels/candidates.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {solveLayout} from '../../pipeline/labels/place.js';
const ring=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
const footprint=(x,y,width,height)=>({bounds:{x,y,width,height},parts:[{x,y,width,height}]});
const solve=(shape,areaPolygons)=>solveLayout({viewport:{width:100,height:100},policy:{edgePadding:0},annotations:[{id:'area',areaPolygons,candidates:[{id:'c',shape}]}]});
test('area label checks its entire footprint and enclosed holes',()=>{
 const polygons=[[ring(10,10,80,80),ring(40,40,5,5)]];
 assert.equal(solve(footprint(20,20,10,10),polygons).placements.length,1);
 assert.equal(solve(footprint(5,20,20,10),polygons).placements.length,0);
 assert.equal(solve(footprint(35,35,20,20),polygons).placements.length,0);
 assert.deepEqual(solve(footprint(35,35,20,20),polygons).outcomes[0].blockerIds,['area-boundary']);
});
test('concave exterior crossing a footprint is rejected even with all corners inside',()=>{
 const concave=[[[10,10],[90,10],[90,90],[60,90],[60,30],[40,30],[40,90],[10,90],[10,10]]];
 assert.equal(solve(footprint(20,20,60,20),[concave]).placements.length,0);
});
test('disconnected label parts and multipolygons retain exact per-part containment',()=>{
 const parts=[{x:15,y:15,width:5,height:5},{x:75,y:75,width:5,height:5}];
 assert.equal(solve({bounds:{x:15,y:15,width:65,height:65},parts},[[ring(10,10,20,20)],[ring(70,70,20,20)]]).placements.length,1);
});

test('lake names try centered interior placement instead of only point-marker offsets',()=>{
 const a={id:'lake',kind:'point-label',anchor:[100,100],areaPolygons:[[[[75,75],[125,75],[125,125],[75,125],[75,75]]]]};
 a.candidates=pointCandidates(a,{bounds:{x:108,y:74,width:40,height:40},parts:[{x:108,y:74,width:40,height:40}]});
 const r=solveLayout({annotations:[a],viewport:{width:300,height:300}});
 assert.equal(r.placements.length,1);assert.equal(r.placements[0].candidateId,'area-center');
});

import {shapeInsidePolygons,projectAreaPolygons} from '../../pipeline/labels/geometry.js';
import {CanvasMapRenderer} from '../../pipeline/render/canvas-renderer.js';
import {solveInitialPlacement} from '../../pipeline/labels/initial-placement.js';
const transformedSolve=(shape,areaPolygons,areaTransform)=>solveLayout({viewport:{x:-1000,y:-1000,width:2000,height:2000},policy:{edgePadding:0},annotations:[{id:'area',areaPolygons,areaTransform,candidates:[{id:'c',shape}]}]});
test('immutable world areas with an affine transform match projected containment including holes',()=>{
 const polygons=[[ring(10,10,80,80),ring(40,40,5,5)]],matrix={a:2,b:0,c:0,d:3,e:100,f:-30};
 for(const shape of [footprint(140,30,10,10),footprint(170,75,40,60),footprint(110,30,40,10)]){
  const expected=shapeInsidePolygons(shape,projectAreaPolygons(polygons,matrix));
  assert.equal(transformedSolve(shape,polygons,matrix).placements.length,Number(expected));
 }
});
test('fast area preparation retains immutable world vertices and a structured-clone-safe camera',()=>{
 const areaPolygons=[[ring(0,0,100,100)]],bounds={x:20,y:20,width:10,height:10};
 const annotation={id:'area',featureId:'f',kind:'region-label',anchor:[25,25],areaPolygons};
 const renderer={controller:{svg:{clientWidth:100},view:{w:50},manifest:{annotations:[annotation]},eligible:()=>undefined,policy:{}},labels:new Map([['area',{placement:{candidateId:'p',footprint:{bounds,parts:[bounds]}},worldCenter:[25,25],center:[25,25]}]])};
 const matrix={a:2,b:0,c:0,d:2,e:10,f:20};
 const [item]=CanvasMapRenderer.prototype.prepareFast.call(renderer,matrix,{x:0,y:0,width:300,height:300},2);
 assert.strictEqual(item.areaPolygons,areaPolygons);assert.deepEqual(item.areaTransform,matrix);
 const cloned=structuredClone(item),r=solveInitialPlacement(structuredClone({annotations:[cloned],viewport:{width:300,height:300}}));
 assert.equal(r.placements.length,1);assert.deepEqual(cloned.areaPolygons,areaPolygons);
});

test('indexed containment agrees with full projection for concavity, holes, affine cameras and edge contact',()=>{
 const concave=[[[0,0],[100,0],[100,100],[65,100],[65,40],[35,40],[35,100],[0,100],[0,0]],ring(10,10,8,9)];
 const areas=[concave,[ring(120,10,40,70),ring(130,30,7,11)]];
 const matrices=[{a:1,b:0,c:0,d:1,e:0,f:0},{a:2.75,b:0,c:0,d:.3,e:-340.23,f:278.456},{a:-3,b:0,c:0,d:2,e:520,f:-13},{a:.35,b:0,c:0,d:-1.75,e:65.7,f:290},
  {a:2,b:.3,c:-.5,d:1.2,e:5,f:7},{a:0,b:2,c:-2,d:0,e:300,f:1}];
 let seed=913;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(const m of matrices){
  const projected=projectAreaPolygons(areas,m);
  for(let i=0;i<250;i++){
   const x=random()*180-10,y=random()*120-10,px=m.a*x+m.c*y+m.e,py=m.b*x+m.d*y+m.f;
   const shape=footprint(px,py,random()*40,random()*40);
   if(i%9===0)shape.parts.push({x:px+50,y:py-20,width:3,height:4});
   assert.equal(shapeInsidePolygons(shape,areas,m),shapeInsidePolygons(shape,projected),JSON.stringify({m,shape}));
  }
  for(const rings of projected)for(const ring of rings)for(const [x,y] of ring)for(const epsilon of [0,-1e-10,1e-10]){
   const shape=footprint(x+epsilon,y+epsilon,2,2);
   assert.equal(shapeInsidePolygons(shape,areas,m),shapeInsidePolygons(shape,projected),'boundary contact must remain exact');
  }
 }
});
test('warm pan/zoom containment never rereads immutable source vertices',()=>{
 let reads=0;const points=Array.from({length:2048},(_,i)=>{const angle=i*Math.PI/1024;return [100*Math.cos(angle),100*Math.sin(angle)];});
 const ring=points.map(([x,y])=>({get 0(){reads++;return x;},get 1(){reads++;return y;},*[Symbol.iterator](){yield this[0];yield this[1];}})),polygons=[[ring]];
 const identity={a:1,b:0,c:0,d:1,e:0,f:0};assert.equal(shapeInsidePolygons(footprint(0,0,5,5),polygons,identity),true);assert(reads>0);
 reads=0;
 for(let i=1;i<=12;i++)assert.equal(shapeInsidePolygons(footprint(i*10,i*20,5,5),polygons,{a:i,b:0,c:0,d:i,e:i*10,f:i*20}),true);
 assert.equal(reads,0,'warm camera passes must not project or scan original vertices');
});
