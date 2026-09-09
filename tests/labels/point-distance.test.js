import test from 'node:test';
import assert from 'node:assert/strict';
import {pointCandidates} from '../../pipeline/labels/candidates.js';
import {solveLayout} from '../../pipeline/labels/place.js';
const nearest=(r,[x,y])=>Math.hypot(Math.max(r.x-x,0,x-r.x-r.width),Math.max(r.y-y,0,y-r.y-r.height));
test('an authored preferred offset cannot bypass the point displacement limit',()=>{
 const bounds={x:100,y:100,width:50,height:20},anchor=[0,0];
 const candidates=pointCandidates({kind:'point-label',anchor},{bounds,parts:[bounds]},{maxPointDisplacement:32});
 assert(candidates.length>0);assert(candidates.every(c=>nearest(c.shape.bounds,anchor)<=32+1e-8));assert(!candidates.some(c=>c.id==='preferred'));
});
test('dense static candidates stay inside the same declared distance envelope',()=>{
 const bounds={x:6,y:0,width:50,height:20},anchor=[0,0];
 const candidates=pointCandidates({kind:'point-label',anchor},{bounds,parts:[bounds]},{maxPointDisplacement:32,densePointCandidates:true});
 assert(candidates.length>17);assert(candidates.every(c=>nearest(c.shape.bounds,anchor)<=32+1e-8));
});
test('required dense search finds a one-pixel slot inside the unchanged displacement limit',()=>{
 const bounds={x:106,y:50,width:10,height:5},anchor=[100,50],annotation={id:'required',kind:'point-label',required:true,anchor};
 const prepare=policy=>({...annotation,candidates:pointCandidates(annotation,{bounds,parts:[bounds]},{densePointCandidates:true,maxPointDisplacement:32,...policy})});
 const layout=a=>solveLayout({annotations:[a],viewport:{x:59.9,y:60.9,width:10.2,height:5.2},policy:{edgePadding:0}});
 const dense=prepare({}),result=layout(dense);
 assert.deepEqual(result.missingRequired,[]);
 assert.equal(result.placements[0].candidateId,'grid--30-11');
 assert(dense.candidates.every(c=>nearest(c.shape.bounds,anchor)<=32+1e-8));
 assert.deepEqual(layout(prepare({densePointStep:2})).missingRequired,['required'],'an explicit coarser policy remains authoritative');
});
test('interactive paint reserve leaves room for subpixel glyph rounding at the distance boundary',()=>{
 const bounds={x:32,y:-5,width:40,height:10},anchor=[0,0];
 const candidates=pointCandidates({kind:'point-label',anchor},{bounds,parts:[bounds]},{maxPointDisplacement:32,pointPaintReserve:.125,densePointCandidates:true});
 assert(candidates.every(c=>nearest(c.shape.bounds,anchor)<=31.875+1e-8));
 assert(!candidates.some(c=>c.id==='preferred'));
});
test('collision padding cannot extend the allowed point-to-painted-text distance',()=>{
 const bounds={x:0,y:0,width:40,height:20},anchor=[100,100];
 const candidates=pointCandidates({kind:'point-label',anchor},{bounds,parts:[bounds],paintInset:.35},{maxPointDisplacement:32,pointPaintReserve:.125,densePointCandidates:true,densePointStep:2});
 const painted=r=>({x:r.x+.35,y:r.y+.35,width:r.width-.7,height:r.height-.7});
 assert(candidates.every(c=>nearest(painted(c.shape.bounds),anchor)<=31.875+1e-8));
});
test('collision padding preserves generated paint positions and narrow boundary slots',()=>{
 const bounds={x:106,y:50,width:10,height:5},anchor=[100,50],annotation={kind:'point-label',required:true,anchor},policy={maxPointDisplacement:32,densePointCandidates:true},inset=.35;
 const paddedBounds={x:bounds.x-inset,y:bounds.y-inset,width:bounds.width+2*inset,height:bounds.height+2*inset};
 const plain=pointCandidates(annotation,{bounds,parts:[bounds]},policy),padded=pointCandidates(annotation,{bounds:paddedBounds,parts:[paddedBounds],paintInset:inset},policy);
 assert(padded.some(c=>c.id==='grid--30-11'),'padding must not discard a valid painted slot');
 assert.deepEqual(padded.map(c=>c.id),plain.map(c=>c.id));
 for(let i=0;i<plain.length;i++){
  const a=plain[i].shape.bounds,b=padded[i].shape.bounds;
  for(const [actual,expected] of [[b.x+inset,a.x],[b.y+inset,a.y],[b.width-2*inset,a.width],[b.height-2*inset,a.height]])assert(Math.abs(actual-expected)<1e-8);
  assert.equal(padded[i].shape.paintInset,inset);
 }
});

const closePolicy={maxPointDisplacement:32,maxOptionalPointDisplacement:16,edgePadding:0};
test('optional points cannot use an old far slot while required static names retain it',()=>{
 const bounds={x:24,y:0,width:20,height:10},anchor=[0,0],metric={bounds,parts:[bounds]};
 const annotation={kind:'point-label',anchor};
 assert(!pointCandidates(annotation,metric,closePolicy).some(c=>c.id==='preferred'));
 assert(pointCandidates({...annotation,required:true},metric,closePolicy).some(c=>c.id==='preferred'));
 const symbol=pointCandidates({...annotation,kind:'symbol'},metric,closePolicy);
 assert.equal(symbol[0].id,'preferred');
});
test('solver rechecks painted distance without treating collision padding or reserves as ink',()=>{
 const bounds={x:15.8,y:0,width:20,height:10},shape={bounds,parts:[bounds],paintInset:.35};
 const annotation={id:'point',kind:'point-label',anchor:[0,0],candidates:[{id:'retained',shape}]};
 for(const measurementReserves of [undefined,{point:{left:4,right:1,top:2,bottom:3}}]){
  const result=solveLayout({annotations:[annotation],viewport:{x:-100,y:-100,width:400,height:400},policy:{...closePolicy,measurementReserves}});
  assert.deepEqual(result.placements,[]);
  assert.equal(result.outcomes[0].reason,'feature-distance');
 }
 const compatibility=solveLayout({annotations:[annotation],viewport:{x:-100,y:-100,width:400,height:400}});
 assert.equal(compatibility.placements.length,1,'unconfigured generic solver retains compatibility');
});

import {CanvasMapRenderer} from '../../pipeline/render/canvas-renderer.js';
test('fast retained Canvas text hides beyond optional anchor limit on zoom and remains stable on pan',()=>{
 const annotation={id:'point',featureId:'source',kind:'point-label',anchor:[100,100]},bounds={x:110,y:95,width:20,height:10};
 const placement={id:'point',candidateId:'preferred',dx:0,dy:0,footprint:{bounds,parts:[bounds]}};
 const renderer={controller:{svg:{clientWidth:500},view:{w:500},manifest:{annotations:[annotation]},eligible:()=>undefined,policy:closePolicy},labels:new Map([['point',{placement,worldCenter:[120,100],center:[120,100]}]])};
 const viewport={x:0,y:0,width:500,height:500};
 const solve=m=>solveLayout({annotations:CanvasMapRenderer.prototype.prepareFast.call(renderer,m,viewport,m.a),viewport,policy:closePolicy});
 const first=solve({a:1,b:0,c:0,d:1,e:0,f:0}),pan=solve({a:1,b:0,c:0,d:1,e:20,f:30});
 assert.equal(first.placements.length,1);assert.equal(pan.placements.length,1);
 assert.equal(pan.placements[0].candidateId,first.placements[0].candidateId);
 assert.equal(pan.placements[0].footprint.bounds.x-first.placements[0].footprint.bounds.x,20);
 const zoom=solve({a:2,b:0,c:0,d:2,e:0,f:0});
 assert.deepEqual(zoom.placements,[]);assert.equal(zoom.outcomes[0].reason,'feature-distance');
 assert.deepEqual(first.placements[0].footprint.bounds,bounds,'later camera passes cannot mutate prior placements');
});
