import test from 'node:test';
import assert from 'node:assert/strict';
import {pointCandidates} from '../../pipeline/labels/candidates.js';
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
