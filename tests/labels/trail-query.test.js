import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrailQuery} from '../../pipeline/labels/trail-query.js';
import {SpatialIndex} from '../../pipeline/labels/spatial-index.js';
const segments=[
 {id:'crossing',a:[-100,10],b:[100,10],width:4,bounds:{x:-100,y:10,width:200,height:0}},
 {id:'edge',a:[20,0],b:[20,50],width:2,bounds:{x:20,y:0,width:0,height:50}},
 {id:'far',a:[500,500],b:[550,550],width:2,bounds:{x:500,y:500,width:50,height:50}}
];
function make(scale=1,x=0){
 const index=new SpatialIndex(32);segments.forEach((s,i)=>index.insert(i,s.bounds));let calls=0;const original=index.query.bind(index);index.query=r=>{calls++;return original(r)};
 return {query:createTrailQuery({segments,index,matrix:{a:scale,b:0,c:0,d:scale,e:x,f:0},inverse:{a:1/scale,b:0,c:0,d:1/scale,e:-x/scale,f:0},strokeScale:1/scale,scale,maxWidth:4}),calls:()=>calls};
}
test('overlapping searches share projected segment objects within one camera snapshot',()=>{
 const {query}=make();assert.equal(query({x:0,y:8,width:5,height:5})[0],query({x:2,y:9,width:6,height:4})[0]);
});
test('a local search covers crossing segments and stroke contacts without repeated global queries',()=>{
 const {query,calls}=make(),local=query.forRegion({x:0,y:0,width:30,height:30});
 for(let x=0;x<18;x++)assert(local({x,y:8,width:2,height:2}).some(s=>s.id==='crossing'));
 assert(local({x:18.9,y:20,width:.2,height:2}).some(s=>s.id==='edge'));
 assert.equal(calls(),1);
});
test('queries outside the cached neighborhood fall back to the full index',()=>{
 const {query}=make(),local=query.forRegion({x:0,y:0,width:30,height:30});
 assert(local({x:510,y:510,width:5,height:5}).some(s=>s.id==='far'));
});
test('new cameras recompute positions and keep constant screen stroke widths',()=>{
 const first=make().query({x:0,y:8,width:5,height:5})[0];
 const next=make(4,200).query({x:200,y:38,width:5,height:5})[0];
 assert.notEqual(first,next);assert.equal(first.line.a.x,-100);assert.equal(next.line.a.x,-200);assert.equal(next.line.a.y,40);assert.equal(next.line.width,4);
});

import {solveLayout} from '../../pipeline/labels/place.js';
const candidate=(id,x,y)=>{const r={x,y,width:14,height:8};return {id,shape:{bounds:r,parts:[r]}};};
test('solver reuses a neighborhood for candidates and safely includes distant fallbacks',()=>{
 const {query}=make();let neighborhoods=0;const original=query.forRegion;query.forRegion=r=>{neighborhoods++;return original(r)};
 const annotations=[{id:'label',kind:'point-label',anchor:[10,10],candidates:[candidate('blocked',10,8)],fallbackCandidates:()=>[candidate('far',300,80)]}];
 const result=solveLayout({annotations,viewport:{width:400,height:200},queryObstacles:query});
 assert.equal(result.placements[0]?.candidateId,'far');assert.equal(neighborhoods,1);
});
test('local and full trail searches produce identical placements and final blockers',()=>{
 const annotations=Array.from({length:20},(_,i)=>({id:'a'+i,kind:'point-label',anchor:[10+i*5,15+i*5],candidates:[candidate('one',10+i*5,8+i*5),candidate('two',30+i*5,20+i*5)]}));
 const local=make().query,full=make().query,args={annotations,viewport:{width:200,height:200}};
 assert.deepEqual(solveLayout({...args,queryObstacles:local}),solveLayout({...args,queryObstacles:r=>full(r)}));
});
test('local caches remain conservative after a rotated and scaled camera transform',()=>{
 const index=new SpatialIndex(32);segments.forEach((s,i)=>index.insert(i,s.bounds));
 const query=createTrailQuery({segments,index,matrix:{a:0,b:2,c:-2,d:0,e:100,f:50},inverse:{a:0,b:-.5,c:.5,d:0,e:-25,f:50},strokeScale:.5,scale:2,maxWidth:4});
 const local=query.forRegion({x:60,y:30,width:40,height:40});
 for(const rect of [{x:78,y:48,width:2,height:4},{x:79,y:49,width:2,height:3}]){
  const crossing=local(rect).find(o=>o.id==='crossing');assert(crossing);assert.equal(crossing.line.width,4);assert.equal(crossing,query(rect).find(o=>o.id==='crossing'));
 }
});
test('detail-hidden paths do not block labels until their ground scale is visible',()=>{
 const ss=segments.map((s,i)=>({...s,maxMpp:i===0?8:64})),index=new SpatialIndex(32);ss.forEach((s,i)=>index.insert(i,s.bounds));
 const args={segments:ss,index,matrix:{a:1,b:0,c:0,d:1,e:0,f:0},inverse:{a:1,b:0,c:0,d:1,e:0,f:0},strokeScale:1,scale:1,maxWidth:4};
 const box={x:0,y:0,width:40,height:40};
 assert.deepEqual(createTrailQuery({...args,metersPerPixel:30})(box).map(o=>o.id),['edge']);
 assert.deepEqual(createTrailQuery({...args,metersPerPixel:3})(box).map(o=>o.id),['crossing','edge']);
});
test('query bounds exactly match four-corner projection across affine camera fuzz cases',()=>{
 let seed=37219;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(let i=0;i<1000;i++){
  const inverse=Object.fromEntries(['a','b','c','d','e','f'].map(k=>[k,(random()-.5)*100]));
  const rect={x:(random()-.5)*100,y:(random()-.5)*100,width:random()*100,height:random()*100},strokeScale=random()*5,maxWidth=random()*10;
  const points=[[rect.x,rect.y],[rect.x+rect.width,rect.y],[rect.x,rect.y+rect.height],[rect.x+rect.width,rect.y+rect.height]].map(p=>({x:inverse.a*p[0]+inverse.c*p[1]+inverse.e,y:inverse.b*p[0]+inverse.d*p[1]+inverse.f}));
  const radius=maxWidth*strokeScale/2,x=Math.min(...points.map(p=>p.x))-radius,y=Math.min(...points.map(p=>p.y))-radius;
  const expected={x,y,width:Math.max(...points.map(p=>p.x))+radius-x,height:Math.max(...points.map(p=>p.y))+radius-y};
  let actual;const index={query(r){actual=r;return [];}};
  createTrailQuery({segments:[],index,matrix:inverse,inverse,strokeScale,scale:1,maxWidth})(rect);
  assert.deepEqual(actual,expected);
 }
});
